all: dist/ennuicastr-download-processor.min.js

dist/ennuicastr-download-processor.min.js: \
	node_modules/.bin/rollup src/*.ts
	npm run build

node_modules/.bin/rollup:
	npm install

clean:
	rm -rf dist
