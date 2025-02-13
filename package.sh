#!/bin/sh
cd packages/dicomImageLoader
# note: folders in the .npmignore won't be correctly handled by tar without explicitly listing them
tar -czf ../../dist/dicom-image-loader-custom-v2.x.tar.gz package.json README.md CHANGELOG.md dist LICENSE assets

cd ../core
tar -czf ../../dist/cornerstone-core-custom-v2.x.tar.gz package.json README.md CHANGELOG.md dist

 