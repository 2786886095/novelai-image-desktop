// Nsis7z cannot decode modern 7za's automatically selected ARM64 filter.
// A fixed BCJ filter is supported by the bundled decoder, including mixed PE payloads.
// Keep this in the build hook so direct electron-builder calls and CI use the same codec.
module.exports = async function(context) {
  if (context.electronPlatformName === 'win32') process.env.ELECTRON_BUILDER_7Z_FILTER = 'BCJ';
};
