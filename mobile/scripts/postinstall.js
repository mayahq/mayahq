/**
 * Postinstall script for fixing React Native crypto polyfills
 * This script ensures that all necessary crypto-related modules are available
 * without modifying the package-lock.json file.
 */

const fs = require('fs');
const path = require('path');

// Paths
const rootDir = path.resolve(__dirname, '..');
const nodeModulesDir = path.join(rootDir, 'node_modules');

console.log('🔧 Running postinstall fixes for crypto modules...');

// Function to ensure a directory exists
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
}

// Function to copy a file if it doesn't exist
function copyFileIfMissing(source, destination) {
  if (!fs.existsSync(destination) && fs.existsSync(source)) {
    ensureDirectoryExists(path.dirname(destination));
    fs.copyFileSync(source, destination);
    console.log(`Copied: ${source} -> ${destination}`);
  }
}

// Function to create a file with content if it doesn't exist
function createFileIfMissing(filePath, content) {
  if (!fs.existsSync(filePath)) {
    ensureDirectoryExists(path.dirname(filePath));
    fs.writeFileSync(filePath, content);
    console.log(`Created file: ${filePath}`);
  }
}

// List of fixes to apply
const fixes = [
  // Fix for sha.js
  () => {
    const shaJsDir = path.join(nodeModulesDir, 'sha.js');
    
    // Check if the SHA1 file exists within sha.js package
    const sha1Path = path.join(shaJsDir, 'sha1.js');
    
    if (!fs.existsSync(sha1Path) && fs.existsSync(shaJsDir)) {
      console.log('Fixing sha.js/sha1.js...');
      
      // Basic SHA1 implementation (simplified version)
      const sha1Content = `
var inherits = require('inherits')
var Hash = require('./hash')
var Buffer = require('safe-buffer').Buffer

var K = [
  0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xca62c1d6
]

var W = new Array(80)

function Sha1 () {
  this.init()
  this._w = W

  Hash.call(this, 64, 56)
}

inherits(Sha1, Hash)

Sha1.prototype.init = function () {
  this._a = 0x67452301
  this._b = 0xefcdab89
  this._c = 0x98badcfe
  this._d = 0x10325476
  this._e = 0xc3d2e1f0

  return this
}

Sha1.prototype._update = function (M) {
  var W = this._w

  var a = this._a | 0
  var b = this._b | 0
  var c = this._c | 0
  var d = this._d | 0
  var e = this._e | 0

  for (var i = 0; i < 16; ++i) W[i] = M.readInt32BE(i * 4)
  for (; i < 80; ++i) W[i] = W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16]

  for (var j = 0; j < 80; ++j) {
    var s = ~~(j / 20)
    var t = (a << 5 | a >>> 27) + e + W[j] + K[s]

    if (s === 0) t += (b & c) | (~b & d)
    else if (s === 1) t += b ^ c ^ d
    else if (s === 2) t += (b & c) | (b & d) | (c & d)
    else t += b ^ c ^ d

    e = d
    d = c
    c = (b << 30 | b >>> 2)
    b = a
    a = t
  }

  this._a = (a + this._a) | 0
  this._b = (b + this._b) | 0
  this._c = (c + this._c) | 0
  this._d = (d + this._d) | 0
  this._e = (e + this._e) | 0
}

Sha1.prototype._hash = function () {
  var H = Buffer.allocUnsafe(20)

  H.writeInt32BE(this._a | 0, 0)
  H.writeInt32BE(this._b | 0, 4)
  H.writeInt32BE(this._c | 0, 8)
  H.writeInt32BE(this._d | 0, 12)
  H.writeInt32BE(this._e | 0, 16)

  return H
}

module.exports = Sha1
      `;
      
      createFileIfMissing(sha1Path, sha1Content);
      
      // Also create hash.js if missing
      const hashPath = path.join(shaJsDir, 'hash.js');
      const hashContent = `
var Buffer = require('safe-buffer').Buffer

// prototype class for hash functions
function Hash (blockSize, finalSize) {
  this._block = Buffer.alloc(blockSize)
  this._finalSize = finalSize
  this._blockSize = blockSize
  this._len = 0
}

Hash.prototype.update = function (data, enc) {
  if (typeof data === 'string') {
    enc = enc || 'utf8'
    data = Buffer.from(data, enc)
  }

  var block = this._block
  var blockSize = this._blockSize
  var length = data.length
  var accum = this._len

  for (var offset = 0; offset < length;) {
    var assigned = accum % blockSize
    var remainder = Math.min(length - offset, blockSize - assigned)

    for (var i = 0; i < remainder; i++) {
      block[assigned + i] = data[offset + i]
    }

    accum += remainder
    offset += remainder

    if ((accum % blockSize) === 0) {
      this._update(block)
    }
  }

  this._len += length
  return this
}

Hash.prototype.digest = function (enc) {
  var rem = this._len % this._blockSize

  this._block[rem] = 0x80

  // zero (rem + 1) trailing bits, where (rem + 1) is the smallest
  // non-negative solution to the equation (length + 1 + (rem + 1)) === finalSize mod blockSize
  this._block.fill(0, rem + 1)

  if (rem >= this._finalSize) {
    this._update(this._block)
    this._block.fill(0)
  }

  var bits = this._len * 8

  if (bits <= 0xffffffff) {
    this._block.writeUInt32BE(bits, this._blockSize - 4)
  } else {
    var lowBits = (bits & 0xffffffff)
    var highBits = (bits - lowBits) / 0x100000000
    this._block.writeUInt32BE(highBits, this._blockSize - 8)
    this._block.writeUInt32BE(lowBits, this._blockSize - 4)
  }

  this._update(this._block)
  var hash = this._hash()

  return enc ? hash.toString(enc) : hash
}

Hash.prototype._update = function () {
  throw new Error('_update must be implemented by subclass')
}

module.exports = Hash
      `;
      
      createFileIfMissing(hashPath, hashContent);
    }
  },
  
  // Add more fixes as needed...
];

// Apply all fixes
fixes.forEach(fix => {
  try {
    fix();
  } catch (err) {
    console.error(`Error applying fix: ${err.message}`);
  }
});

console.log('✅ Postinstall fixes completed successfully!'); 