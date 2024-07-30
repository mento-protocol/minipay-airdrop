#!/bin/bash

set -o allexport
source .env.local 
set +o allexport

pnpm nodemon node_modules/@google-cloud/functions-framework/build/src/main.js -- --target=$1 --port $2
