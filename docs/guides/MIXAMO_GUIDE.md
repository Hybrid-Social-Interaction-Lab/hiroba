# Mixamo Animation Guide for GLB Avatars

Guide for adding animations to GLB format avatars using Mixamo.

## Method 1: GLB → FBX → Mixamo → FBX + GLB Merge (Recommended)

This method converts GLB to FBX, gets animation from Mixamo, then merges back into GLB. Most reliable for maintaining textures.

### Step 1: Convert GLB to FBX in Blender

⚠️ **Critical**: Online converters often break face textures. Use Blender instead.

1. **Install Blender** (latest version)
2. **Import GLB**:
   - File → Import → glTF 2.0 (.glb/.gltf)
   - Select your avatar file
3. **Verify textures**:
   - Switch to Shading workspace
   - Check that face/body textures load correctly
4. **Export to FBX**:
   - File → Export → FBX (.fbx)
   - **Export settings** (important):
     - Selected Objects: ✓
     - Object Types: Mesh, Armature ✓
     - Transform: Apply Scalings = FBX Units Scale ✓
     - Geometry: Smoothing = Face ✓
     - Armature: Add Leaf Bones = OFF
     - Animation: Bake Animation = ON (if animations exist)

### Step 2: Get Animation from Mixamo

1. Visit [https://www.mixamo.com/](https://www.mixamo.com/) (Adobe ID required)
2. Upload the FBX file
3. Choose animation (recommended idle animations):
   - **Idle** - Basic standing idle
   - **Breathing Idle** - Breathing emphasized
   - **Standing Idle** - Natural standing
   - **Slight Head Turn Idle** - Subtle head movement
4. **Download settings** (critical):
   - Format: **FBX Binary** (.fbx)
   - Skin: **WITHOUT SKIN** (animation only)
   - Overdrive: 10-20% (natural motion)
   - Frames per second: **30**
   - In Place: ✓

### Step 3: Merge Animation into GLB Using Blender

1. **Open Blender**
2. **Import original GLB**:
   - File → Import → glTF 2.0
   - Select your base avatar_testing.glb
3. **Import Mixamo animation**:
   - File → Import → FBX
   - Select the breathing_idle.fbx (animation)
4. **Switch to Animation Workspace**
5. **Merge animations**:
   - Open Dope Sheet → Switch to Action Editor
   - Select GLB avatar's **Armature** (not the Mixamo character)
   - Create a new Action: "Idle"
   - Select Mixamo **Armature**
   - Select all bones: `A`
   - Copy keyframes: `Ctrl+C`
   - Select GLB **Armature**
   - Paste: `Ctrl+V`
6. **Verify animation**:
   - Press spacebar to play animation
   - Check it looks natural
7. **Delete Mixamo character** (keep only your avatar)
8. **Export as GLB**:
   - Select your avatar (not Mixamo char)
   - File → Export → glTF 2.0
   - **Export settings**:
     - Format: **glTF Binary (.glb)**
     - Include: Animations ✓
     - Selected Objects: ✓

### Step 4: Test

Replace the old GLB file with your new one and test in the application.

---

## Method 2: Blender Direct Animation (No Mixamo)

If Mixamo account access is an issue:

1. **Open your GLB in Blender**
2. **Switch to Animation Workspace**
3. **Create simple idle animation**:
   - Frame 1: Set initial pose (press `I` → Rotation)
   - Frame 60: Lean forward slightly + rotate bones
   - Frame 120: Return to initial pose
4. **Loop the animation**:
   - Action Editor → Set loop range
5. **Export as GLB** with animations included

---

## Method 3: Direct FBX Animation Conversion (No Blender)

Using command-line tools:

```bash
# Option A: fbx2gltf
npm install -g fbx2gltf
fbx2gltf mixamo_animation.fbx -o output.glb

# Option B: gltf-pipeline
npm install -g gltf-pipeline
gltf-pipeline -i model.gltf -o model.glb
```

---

## Current Status Check

Test your avatar's current animation state:

1. **Open browser console**: `F12`
2. **Visit**: `http://localhost:3000/avatar-glb-test`
3. **Check console output**:
   - `Found X animations` → Animations exist
   - `No animations found` → Using procedural animation

---

## Troubleshooting: Face Texture Corruption

### Symptoms
- Face turns black after conversion
- Textures appear inverted or distorted
- Body looks fine but face is broken

### Causes
- UV mapping issues during conversion
- sRGB color space mismatch
- Online converter errors

### Solutions

**Immediate fix (in test page)**:
1. Visit `http://localhost:3000/avatar-glb-test`
2. Click **🛡️ Pre-Mixamo Fix** (before conversion)
3. Or click **🎨 Fix Face Textures** (after corruption)

**Manual fix in Blender**:
1. Open corrupted GLB in Blender
2. Switch to Shading workspace
3. Select face material
4. In Shader Editor:
   - Find Image Texture node
   - Change from "Non-Color" to "sRGB"
   - Check UV coordinates (may need Y-flip)
5. Re-export as GLB

**Prevention checklist** ✅:
- Always convert GLB→FBX using Blender (never online)
- Test Blender export before uploading to Mixamo
- Download Mixamo as "FBX Binary, WITHOUT SKIN"
- Use Blender for FBX→GLB merge (not online)
- Verify textures after each step

---

## Advanced: Multiple Animations in One GLB

Create a GLB with Idle, Walk, Talk animations:

1. **In Blender**, import base GLB
2. **Import first FBX animation** (Idle)
3. **Action Editor**: Name it "Idle"
4. **Import second FBX** (Walk)
5. **Action Editor**: Name it "Walk"
6. **Repeat** for each animation
7. **Export GLB** with all animations checked

**In code**:
```javascript
gltfLoader.load('avatar_multi.glb', (gltf) => {
    const animations = gltf.animations; // [Idle, Walk, Talk, ...]
    const idleAnim = animations.find(a => a.name === 'Idle');
    mixer.clipAction(idleAnim).play();
});
```

---

## Blender Export Settings Reference

| Setting | Value | Note |
|---------|-------|------|
| Format | glTF Binary (.glb) | Required for web |
| Include: Animations | ✓ | Critical if GLB has animations |
| Include: Materials | ✓ | For textures |
| Include: Cameras | ✗ | Optional |
| Include: Lights | ✗ | Optional |
| Include: Armatures | ✓ | Critical for rigged models |
| Export: Deformation | ✓ | For skeletal animation |
| Transform: Scale | 1.0 | Default |

---

## When to Use Each Method

| Method | When to Use | Time | Difficulty |
|--------|-----------|------|-----------|
| **Method 1** (Recommended) | Production avatars | 20 min | Medium |
| **Method 2** | No Mixamo access | 15 min | Low |
| **Method 3** | CLI preference | 5 min | High |

**For most users**: Use Method 1 (Blender-based, most reliable).

---

## Common Issues and Fixes

### Avatar has no animation
- Check GLB actually has animations: test page shows count
- Re-export from Blender with "Include: Animations" ✓

### Animation plays once then stops
- In code, set loop: `action.setLoop(THREE.LoopRepeat, Infinity)`
- Or use Blender Action Editor to mark as "Looping"

### Animation is jittery/stuttering
- Check framerate: Mixamo download should be 30fps
- Reduce animation speed in code: `action.timeScale = 0.8`

### Mixamo won't accept FBX
- Make sure Blender export has "Armature" with bones
- Try "Add Leaf Bones: OFF" in export settings
- Use Blender 3.0+

---

## References

- **Mixamo**: https://www.mixamo.com/
- **Blender**: https://www.blender.org/
- **glTF Format**: https://www.khronos.org/gltf/
- **Three.js Loader**: https://threejs.org/docs/?q=loader#examples/en/loaders/GLTFLoader

For web avatar display in Zoom SDK integration, see the main README.
