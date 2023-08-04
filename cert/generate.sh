#!/usr/bin/env bash

# Adopted from:
# https://github.com/Sup3r-Us3r/grpc-go-example/blob/main/grpc/cert/generate.sh
# This generates a root ca uses that ca to sign a wildcard cert for *.cloudapis.test
#
# Server-side uses: server-cert.pem and server-key.pem
# Client-side uses: ca-cert.pem
#
# I really hope it doesn't matter, but this worked for me with
# % openssl version
# OpenSSL 1.1.1s  1 Nov 2022

SCRIPT_PATH="$(cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "${SCRIPT_PATH}"

# Remove all .pem, .srl and .cnf files
rm -f *.{pem,srl,cnf}

# /C= is for country
# /ST= is for state or province
# /L= is for locality name or city
# /O= is for organisation
# /OU= is for organisation unit
# /CN= is for common name or domain name
# /emailAddress= is for email address

# golang doesn't seem to care, but nodejs needs the DN between root and
# server certs to be different
rootsubj="/O=Cloud Company/CN=Cloud Company Fake Root CA"
subj="/O=Cloud Company/CN=*.cloudapis.test"

# 1. Generate CA's private key and self-signed certificate
openssl req -x509 -newkey rsa:4096 -days 365 -nodes -keyout ca-key.pem -out ca-cert.pem -subj "${rootsubj}"

echo "CA's self-signed certificate"
openssl x509 -in ca-cert.pem -noout -text

# 2. Generate web server's private key and certificate signing request (CSR)
openssl req -newkey rsa:4096 -nodes -keyout server-key.pem -out server-req.pem -subj "${subj}"

# 3. Use CA's private key to sign web server's CSR and get back the signed certificate
echo "subjectAltName=DNS:*.cloudapis.test,IP:0.0.0.0" > server-ext.cnf
openssl x509 -req -in server-req.pem -days 60 -CA ca-cert.pem -CAkey ca-key.pem -CAcreateserial -out server-cert.pem -extfile server-ext.cnf

echo "Server's signed certificate"
openssl x509 -in server-cert.pem -noout -text
