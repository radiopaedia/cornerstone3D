#!/bin/sh

mkdir -p dist

cd packages/dicomImageLoader
yarn build:esm
VERSION=$(grep -o '"version": "[^"]\+' /home/flaki/work/rp/cornerstone3D/packages/dicomImageLoader/package.json|cut -c 13-)
tar -czf ../../dist/dicom-image-loader-custom-v$VERSION-rp.tar.gz package.json README.md CHANGELOG.md dist LICENSE assets

cd ../core
yarn build:esm
VERSION=$(grep -o '"version": "[^"]\+' /home/flaki/work/rp/cornerstone3D/packages/dicomImageLoader/package.json|cut -c 13-)
tar -czf ../../dist/cornerstone-core-custom-v$VERSION-rp.tar.gz package.json README.md CHANGELOG.md dist
