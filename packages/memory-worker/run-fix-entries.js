#!/usr/bin/env node
require('dotenv').config();
require('ts-node/register');
require('./src/services/feed-processor/fix-blank-entries.ts');
