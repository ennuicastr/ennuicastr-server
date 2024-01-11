all: dist/ennuicastr-download-processor.min.js

dist/ennuicastr-download-processor.min.js: \
	dist/ennuicastr-download-processor.js \
	node_modules/.bin/uglifyjs
	cd dist && ../node_modules/.bin/uglifyjs -m --comments '/^!|SPDX/' \
		--source-map "content='ennuicastr-download-processor.js.map',url='ennuicastr-download-processor.min.js.map'" \
		ennuicastr-download-processor.js -o ennuicastr-download-processor.min.js

dist/ennuicastr-download-processor.js: src/*.ts node_modules/.bin/uglifyjs
	mkdir -p dist
	./browserify-build.js | ./node_modules/.bin/exorcist \
		-u ennuicastr-download-processor.js.map $@.map > $@

node_modules/.bin/uglifyjs:
	npm install

clean:
	rm -rf dist
