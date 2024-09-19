all: dist/ennuicastr-download-chooser.min.js

dist/ennuicastr-download-chooser.js dist/ennuicastr-download-chooser.min.js: \
	node_modules/.bin/rollup src/*.ts
	npm run build

node_modules/.bin/rollup:
	npm install

clean:
	rm -rf dist
