#!/bin/sh

mkdir -p dist && rm dist/*.tgz

cd packages/dicomImageLoader
yarn build:esm
yarn pack
VERSION=$(grep -o '"version": "[^"]\+' /home/flaki/work/rp/cornerstone3D/packages/dicomImageLoader/package.json|cut -c 13-)
mv cornerstonejs*.tgz ../../dist/

cd ../core
yarn build:esm
yarn pack
VERSION=$(grep -o '"version": "[^"]\+' /home/flaki/work/rp/cornerstone3D/packages/dicomImageLoader/package.json|cut -c 13-)
mv cornerstonejs*.tgz ../../dist/
