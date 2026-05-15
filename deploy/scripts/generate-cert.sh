#!/bin/bash
# Self-signed certificate generation script

echo "Generating self-signed SSL certificate..."

# Create private key
openssl genrsa -out server.key 2048

# Create certificate signing request
openssl req -new -key server.key -out server.csr -subj "/C=JP/ST=Tokyo/L=Tokyo/O=VSDK/OU=Dev/CN=localhost"

# Create self-signed certificate
openssl x509 -req -days 365 -in server.csr -signkey server.key -out server.crt

# Clean up CSR
rm server.csr

echo "SSL certificate generated successfully!"
echo "Files created: server.key, server.crt"