const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const DEFAULT_CONDITIONS = [
  {
    id: 'condition-a',
    name: 'Condition A',
    background: 'avatar_backgrounds/avatar_background_1.jpg',
    agents: [
      {
        name: 'Agent A',
        avatarModel: '/models/female.fbx',
        prompt: 'You are a helpful AI assistant. Limit responses to 5 sentences.',
        triggerKeywords: ['agent', 'assistant', 'AI', 'bot']
      }
    ]
  },
  {
    id: 'condition-b',
    name: 'Condition B',
    background: 'avatar_backgrounds/avatar_background_4.jpg',
    agents: [
      {
        name: 'Agent B',
        avatarModel: '/models/man_new_idle2.fbx',
        prompt: 'You are a helpful AI assistant. Limit responses to 5 sentences.',
        triggerKeywords: ['agent', 'assistant', 'AI', 'bot']
      }
    ]
  }
];

function normalizeEnvString(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function parseEnvBool(value, defaultValue) {
  const v = normalizeEnvString(value);
  if (v === undefined || v === null || v === '') return defaultValue;
  return String(v).toLowerCase() === 'true';
}

function normalizeStringList(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  const out = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (out.some((v) => v.toLowerCase() === trimmed.toLowerCase())) continue;
    out.push(trimmed);
  }
  return out;
}

function pickAwsMetadata(err) {
  const md = err && err.$metadata ? err.$metadata : null;
  if (!md) return undefined;
  return {
    httpStatusCode: md.httpStatusCode,
    requestId: md.requestId,
    attempts: md.attempts,
    totalRetryDelay: md.totalRetryDelay
  };
}

async function httpGetJson(url, headers = {}, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === 'https:' ? https : http;

    const req = lib.request(
      {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            const err = new Error(`HTTP ${res.statusCode} from ${url}`);
            err.name = 'HttpStatusError';
            err.statusCode = res.statusCode;
            err.body = data;
            return reject(err);
          }

          try {
            resolve(JSON.parse(data));
          } catch (e) {
            const err = new Error(`Failed to parse JSON from ${url}`);
            err.name = 'JsonParseError';
            err.cause = e;
            err.body = data;
            reject(err);
          }
        });
      }
    );

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timeout after ${timeoutMs}ms calling ${url}`));
    });
    req.end();
  });
}

let DynamoDBClient;
let DynamoDBDocumentClient;
let GetCommand;
let PutCommand;
let UpdateCommand;

/**
 * Settings Manager
 * Manages persistent application settings stored in a JSON file
 */
class SettingsManager {
  constructor(filePath = normalizeEnvString(process.env.SETTINGS_FILE_PATH) || './data/settings.json') {
    this.filePath = typeof filePath === 'string' ? filePath.trim() : filePath;
    this.defaults = this.getDefaults();

    this.backend = (normalizeEnvString(process.env.SETTINGS_BACKEND) || 'file').toLowerCase();

    this.ddbTable = normalizeEnvString(process.env.SETTINGS_DDB_TABLE);
    this.ddbRegion = normalizeEnvString(process.env.SETTINGS_DDB_REGION) || 'ap-northeast-1';
    this.ddbPkName = normalizeEnvString(process.env.SETTINGS_DDB_PK_NAME) || 'id';
    this.ddbPkValue = normalizeEnvString(process.env.SETTINGS_DDB_PK_VALUE) || 'global';
    this.ddbConsistentRead = parseEnvBool(process.env.SETTINGS_DDB_CONSISTENT_READ, true);

    this._ddbDocClient = null;
    this._ddbEcsCredentialsCache = null;
  }

  _isDynamoDb() {
    return this.backend === 'dynamodb';
  }

  _getDdbDocClient() {
    if (!this._isDynamoDb()) {
      return null;
    }

    if (!this.ddbTable) {
      throw new Error('SETTINGS_DDB_TABLE is required when SETTINGS_BACKEND=dynamodb');
    }

    if (this._ddbDocClient) {
      return this._ddbDocClient;
    }

    ({ DynamoDBClient } = require('@aws-sdk/client-dynamodb'));
    ({ DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb'));

    const client = new DynamoDBClient({
      region: this.ddbRegion,
      credentials: this._getDdbCredentialsProvider()
    });
    this._ddbDocClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: {
        removeUndefinedValues: true
      }
    });

    return this._ddbDocClient;
  }

  _getDdbCredentialsProvider() {
    // Important: If AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY are set (e.g. for cross-account Polly),
    // the default AWS credential chain will use them for ALL AWS services, including DynamoDB.
    // On ECS, we instead want DynamoDB to use the task role credentials from container metadata.
    const relativeUri = normalizeEnvString(process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI);
    const fullUri = normalizeEnvString(process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI);

    if (!relativeUri && !fullUri) {
      // Not running in ECS (or not using task-role credentials); fall back to default provider chain.
      return undefined;
    }

    return async () => {
      const now = Date.now();
      const cached = this._ddbEcsCredentialsCache;
      if (cached && cached.expirationMs && cached.expirationMs - now > 60 * 1000) {
        return cached.creds;
      }

      const token = normalizeEnvString(process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN);
      const tokenFile = normalizeEnvString(process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE);
      let authToken = token;
      if (!authToken && tokenFile) {
        try {
          authToken = normalizeEnvString(await fs.readFile(tokenFile, 'utf8'));
        } catch (e) {
          // Ignore and attempt without token.
        }
      }

      const url = fullUri || `http://169.254.170.2${relativeUri}`;
      const headers = {};
      if (authToken) {
        headers.Authorization = authToken;
      }

      const res = await httpGetJson(url, headers, 2000);
      const accessKeyId = res.AccessKeyId || res.accessKeyId;
      const secretAccessKey = res.SecretAccessKey || res.secretAccessKey;
      const sessionToken = res.Token || res.sessionToken;
      const expiration = res.Expiration || res.expiration;

      if (!accessKeyId || !secretAccessKey) {
        const err = new Error('ECS credential response missing AccessKeyId/SecretAccessKey');
        err.name = 'EcsCredentialsError';
        err.responseKeys = Object.keys(res || {});
        throw err;
      }

      const expirationMs = expiration ? Date.parse(expiration) : undefined;
      const creds = {
        accessKeyId,
        secretAccessKey,
        sessionToken
      };

      this._ddbEcsCredentialsCache = { creds, expirationMs };
      return creds;
    };
  }

  _ddbKey() {
    return { [this.ddbPkName]: this.ddbPkValue };
  }

  _ddbContext(operation) {
    const hasEcsCreds = !!(
      normalizeEnvString(process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI) ||
      normalizeEnvString(process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI)
    );
    return {
      operation,
      backend: this.backend,
      table: this.ddbTable,
      region: this.ddbRegion,
      pkName: this.ddbPkName,
      pkValue: this.ddbPkValue,
      key: this._ddbKey(),
      consistentRead: this.ddbConsistentRead,
      ddbCredentialSource: hasEcsCreds ? 'ecs-task-role' : 'default-provider-chain'
    };
  }

  _wrapDdbError(operation, err) {
    const details = {
      ...this._ddbContext(operation),
      awsErrorName: err && err.name ? err.name : undefined,
      awsMetadata: pickAwsMetadata(err)
    };

    const baseMsg = err && err.message ? err.message : String(err);
    const wrapped = new Error(
      `[Settings] DynamoDB ${operation} failed (${details.region}/${details.table} ${details.pkName}=${details.pkValue}): ${baseMsg}`
    );
    wrapped.name = 'SettingsDynamoDbError';
    wrapped.details = details;
    wrapped.cause = err;
    return wrapped;
  }

  /**
   * Load settings from file
   * Returns defaults if file doesn't exist or is corrupted
   */
  async load() {
    if (this._isDynamoDb()) {
      return this._ddbLoad();
    }
    try {
      const data = await fs.readFile(this.filePath, 'utf8');
      const settings = JSON.parse(data);

      // Merge with defaults to ensure all keys exist
      return this.mergeWithDefaults(settings);
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log('[Settings] File not found, creating with defaults');
        await this.save(this.defaults);
        return this.defaults;
      }
      if (err instanceof SyntaxError) {
        console.warn('[Settings] Corrupt settings file, resetting to defaults');
        try { await this.save(this.defaults); } catch (_) {}
      } else {
        console.error('[Settings] Error loading settings:', err);
      }
      return this.defaults;
    }
  }

  /**
   * Save settings to file
   */
  async save(settings) {
    if (this._isDynamoDb()) {
      const validatedSettings = this.validate(settings);
      await this._ddbSave(validatedSettings);
      return validatedSettings;
    }
    try {
      // Ensure directory exists
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });

      // Validate settings before saving
      const validatedSettings = this.validate(settings);

      // Write to file with pretty formatting
      await fs.writeFile(
        this.filePath,
        JSON.stringify(validatedSettings, null, 2),
        'utf8'
      );

      console.log('[Settings] Settings saved successfully');
      return validatedSettings;
    } catch (err) {
      console.error('[Settings] Error saving settings:', err);
      throw err;
    }
  }

  /**
   * Update a specific setting
   */
  async update(key, value) {
    const settings = await this.load();

    // Support nested keys like "silenceDetection.threshold"
    const keys = key.split('.');
    let current = settings;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;

    return await this.save(settings);
  }

  /**
   * Get a specific setting
   */
  async get(key) {
    const settings = await this.load();

    if (!key) {
      return settings;
    }

    // Support nested keys
    const keys = key.split('.');
    let current = settings;

    for (const k of keys) {
      if (current[k] === undefined) {
        return undefined;
      }
      current = current[k];
    }

    return current;
  }

  /**
   * Reset to defaults
   */
  async reset() {
    console.log('[Settings] Resetting to defaults');
    return await this.save(this.defaults);
  }

  async _ddbLoad() {
    const docClient = this._getDdbDocClient();

    let getRes;
    try {
      getRes = await docClient.send(
        new GetCommand({
          TableName: this.ddbTable,
          Key: this._ddbKey(),
          ConsistentRead: this.ddbConsistentRead
        })
      );
    } catch (err) {
      throw this._wrapDdbError('GetItem', err);
    }

    const item = getRes.Item;
    const savedSettings = item && item.settings ? item.settings : null;

    if (!savedSettings) {
      console.log('[Settings] DynamoDB item missing; creating with defaults');
      const validatedDefaults = this.validate(this.defaults);

      try {
        await docClient.send(
          new PutCommand({
            TableName: this.ddbTable,
            Item: {
              ...this._ddbKey(),
              settings: validatedDefaults,
              version: 1,
              updatedAt: new Date().toISOString()
            },
            ConditionExpression: 'attribute_not_exists(#pk)',
            ExpressionAttributeNames: {
              '#pk': this.ddbPkName
            }
          })
        );
      } catch (err) {
        // Another task may have created it first.
        if (!err || err.name !== 'ConditionalCheckFailedException') {
          throw this._wrapDdbError('PutItem', err);
        }
      }

      return validatedDefaults;
    }

    return this.mergeWithDefaults(savedSettings);
  }

  async _ddbSave(validatedSettings) {
    const docClient = this._getDdbDocClient();

    // Update is atomic; we also keep a version counter for debugging/auditing.
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: this.ddbTable,
          Key: this._ddbKey(),
          UpdateExpression: 'SET #settings = :settings, #updatedAt = :updatedAt ADD #version :inc',
          ExpressionAttributeNames: {
            '#settings': 'settings',
            '#updatedAt': 'updatedAt',
            '#version': 'version'
          },
          ExpressionAttributeValues: {
            ':settings': validatedSettings,
            ':updatedAt': new Date().toISOString(),
            ':inc': 1
          }
        })
      );
    } catch (err) {
      throw this._wrapDdbError('UpdateItem', err);
    }

    console.log('[Settings] Settings saved successfully (DynamoDB)');
  }

  /**
   * Get default settings
   */
  getDefaults() {
    return {
      conditions: DEFAULT_CONDITIONS,
      llm: {
        model: 'gpt-3.5-turbo',
        maxTokens: 150,
        temperature: 0.7
      },
      silenceDetection: {
        enabled: true,
        threshold: 10,
        botSelection: { mode: 'random', botName: null },
        messages: [
          "Sorry, do you have any questions?",
          "Is there anything I can help clarify?",
          "Please feel free to share your thoughts."
        ]
      },
      periodicSpeech: {
        enabled: true,
        interval: 180,
        botSelection: { mode: 'random', botName: null },
        messages: [
          "How is the meeting progressing?",
          "Would you like to discuss any specific topics?",
          "Are there any important points to cover?"
        ]
      },
      periodicSpeechPrompt: "use softeners (to be polite) or floor-grabbing signals (to get attention fast) first, depending on the current conversation flow, before interruption.",
      aiStyle: "Please follow the instructions and join conversation.",
      promptTemplate: "You are %agent_name%. Today is %date% and the current time is %time%.\n\n%bot_prompt%\n\nParticipants in this call: %user_list%.\n\nRecent conversation:\n%conversation_history%",
      nameDetection: {
        enabled: true,
        keywords: ["agent", "assistant", "AI", "bot"]
      },
      avatarBackground: 'avatar_backgrounds/avatar_background_1.jpg',
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Merge loaded settings with defaults (to handle new settings)
   * Auto-migrate from old conditionPrompts/avatarDisplayNames format if needed
   */
  mergeWithDefaults(settings) {
    // Migration: if old format (conditionPrompts + avatarDisplayNames), convert to new format
    let conditions = settings && Array.isArray(settings.conditions) ? settings.conditions : null;
    if (!conditions && settings && settings.conditionPrompts && typeof settings.conditionPrompts === 'object') {
      conditions = this._migrateConditions(settings.conditionPrompts, settings.avatarDisplayNames || {});
    }
    if (!conditions) {
      conditions = this.defaults.conditions;
    }
    // Migration: upgrade conditions that still use flat agentName/avatarModel/prompt/triggerKeywords
    conditions = conditions.map(c => {
      if (!Array.isArray(c.agents) && (c.agentName || c.prompt || c.avatarModel)) {
        const { agentName, avatarModel, prompt, triggerKeywords, background, agents: _a, ...rest } = c;
        return {
          ...rest,
          background: background || undefined,
          agents: [{
            name: agentName || 'Agent',
            avatarModel: avatarModel || '/models/female.fbx',
            prompt: prompt || '',
            triggerKeywords: Array.isArray(triggerKeywords) ? triggerKeywords : []
          }]
        };
      }
      return c;
    });

    return {
      ...this.defaults,
      ...settings,
      conditions,
      llm: {
        ...this.defaults.llm,
        ...(settings.llm || {})
      },
      silenceDetection: {
        ...this.defaults.silenceDetection,
        ...(settings.silenceDetection || {}),
        botSelection: {
          ...this.defaults.silenceDetection.botSelection,
          ...((settings.silenceDetection && settings.silenceDetection.botSelection) || {})
        }
      },
      periodicSpeech: {
        ...this.defaults.periodicSpeech,
        ...(settings.periodicSpeech || {}),
        botSelection: {
          ...this.defaults.periodicSpeech.botSelection,
          ...((settings.periodicSpeech && settings.periodicSpeech.botSelection) || {})
        }
      },
      nameDetection: {
        ...this.defaults.nameDetection,
        ...(settings.nameDetection || {})
      },
      periodicSpeechPrompt:
        (settings && typeof settings.periodicSpeechPrompt === 'string')
          ? settings.periodicSpeechPrompt
          : this.defaults.periodicSpeechPrompt,
      promptTemplate:
        (settings && typeof settings.promptTemplate === 'string')
          ? settings.promptTemplate
          : this.defaults.promptTemplate
    };
  }

  /**
   * Auto-migrate old conditionPrompts format to new conditions array
   */
  _migrateConditions(conditionPrompts, avatarDisplayNames) {
    const conditions = [];
    const modelMap = {
      'female-dominated': { model: '/models/female.fbx', name: 'Mary' },
      'male-dominated': { model: '/models/man_new_idle2.fbx', name: 'Peter' }
    };

    for (const [id, prompt] of Object.entries(conditionPrompts || {})) {
      const config = modelMap[id];
      if (config) {
        const displayNames = Array.isArray(avatarDisplayNames[config.model])
          ? avatarDisplayNames[config.model]
          : [config.name];
        conditions.push({
          id,
          name: id === 'female-dominated' ? 'Female Dominated' : 'Male Dominated',
          agents: [{
            name: displayNames[0] || config.name,
            avatarModel: config.model,
            prompt,
            triggerKeywords: []
          }]
        });
      }
    }

    return conditions.length > 0 ? conditions : this.defaults.conditions;
  }

  /**
   * Find a condition by id
   */
  getConditionById(conditions, id) {
    if (!Array.isArray(conditions) || !id) return null;
    return conditions.find((c) => c && c.id === id) || null;
  }

  /**
   * Validate settings
   */
  validate(settings) {
    const validated = { ...settings };

    // Validate silence detection threshold
    if (validated.silenceDetection && validated.silenceDetection.threshold) {
      const threshold = Number(validated.silenceDetection.threshold);
      if (threshold < 5 || threshold > 1000) {
        console.warn('[Settings] Invalid silence threshold, using default');
        validated.silenceDetection.threshold = this.defaults.silenceDetection.threshold;
      }
    }

    // Validate silence detection messages
    if (validated.silenceDetection && validated.silenceDetection.messages) {
      if (!Array.isArray(validated.silenceDetection.messages) ||
          validated.silenceDetection.messages.length === 0) {
        console.warn('[Settings] Invalid silence messages, using default');
        validated.silenceDetection.messages = this.defaults.silenceDetection.messages;
      }
    }

    // Validate periodic speech interval
    if (validated.periodicSpeech && validated.periodicSpeech.interval !== undefined) {
      const interval = Number(validated.periodicSpeech.interval);
      if (!Number.isFinite(interval) || interval < 30 || interval > 600) {
        console.warn('[Settings] Invalid periodic interval, using default');
        validated.periodicSpeech.interval = this.defaults.periodicSpeech.interval;
      }
    }

    // Validate periodic speech messages
    if (validated.periodicSpeech && validated.periodicSpeech.messages !== undefined) {
      if (!Array.isArray(validated.periodicSpeech.messages) || validated.periodicSpeech.messages.length === 0) {
        console.warn('[Settings] Invalid periodic messages, using default');
        validated.periodicSpeech.messages = this.defaults.periodicSpeech.messages;
      }
    }

    // Validate AI style is not empty
    if (!validated.aiStyle || validated.aiStyle.trim() === '') {
      console.warn('[Settings] Empty AI style, using default');
      validated.aiStyle = this.defaults.aiStyle;
    }

    // Validate periodic speech prompt is not empty
    if (!validated.periodicSpeechPrompt || validated.periodicSpeechPrompt.trim() === '') {
      console.warn('[Settings] Empty periodicSpeechPrompt, using default');
      validated.periodicSpeechPrompt = this.defaults.periodicSpeechPrompt;
    }

    // Validate keywords array
    if (validated.nameDetection && validated.nameDetection.keywords !== undefined) {
      const normalizedKeywords = normalizeStringList(validated.nameDetection.keywords);
      if (normalizedKeywords.length === 0) {
        console.warn('[Settings] Invalid keywords, using default');
        validated.nameDetection.keywords = this.defaults.nameDetection.keywords;
      } else {
        validated.nameDetection.keywords = normalizedKeywords;
      }
    }

    // Validate avatar display names map
    if (validated.avatarDisplayNames !== undefined) {
      const map = validated.avatarDisplayNames;
      if (!map || typeof map !== 'object' || Array.isArray(map)) {
        console.warn('[Settings] Invalid avatarDisplayNames, using default');
        validated.avatarDisplayNames = this.defaults.avatarDisplayNames;
      } else {
        // Keep only string->array<string> entries
        const cleaned = {};
        for (const [modelPath, displayName] of Object.entries(map)) {
          if (typeof modelPath !== 'string') continue;
          const aliases = normalizeStringList(displayName);
          if (aliases.length > 0) {
            cleaned[modelPath] = aliases;
          }
        }
        validated.avatarDisplayNames = cleaned;
      }
    }

    // Validate condition prompts map
    if (validated.conditionPrompts !== undefined) {
      const map = validated.conditionPrompts;
      if (!map || typeof map !== 'object' || Array.isArray(map)) {
        console.warn('[Settings] Invalid conditionPrompts, using default');
        validated.conditionPrompts = this.defaults.conditionPrompts;
      } else {
        const cleaned = {};
        for (const [conditionKey, prompt] of Object.entries(map)) {
          if (typeof conditionKey === 'string' && typeof prompt === 'string') {
            const k = conditionKey.trim().toLowerCase();
            cleaned[k] = prompt;
          }
        }
        validated.conditionPrompts = cleaned;
      }
    }

    // Update timestamp
    validated.lastUpdated = new Date().toISOString();

    return validated;
  }
}

module.exports = SettingsManager;
