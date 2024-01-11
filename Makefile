CC=gcc
CFLAGS=-O3

all: rec sounds \
	server/ennuicastr.js \
        cook/oggcorrect cook/oggduration cook/oggmeta cook/oggstender \
        cook/oggtracks cook/wavduration \
	web/ecdssw.min.js \
	web/panel/rec/dlx/ennuicastr-download-processor.min.js \
	web/assets/js/localforage.min.js \
	web/assets/libs/libspecbleach-0.1.7-js2.js \
	web/assets/libs/yalap-1.0.1-zip.js

test: server/ennuicastr-beta.js

rec sounds:
	mkdir -p $@

server/ennuicastr.js server/ennuicastr-beta.js: server/ennuicastr.ts node_modules/.bin/tsc
	node_modules/.bin/tsc $< --outFile $@.tmp
	mv $@.tmp $@

web/panel/rec/dlx/ennuicastr-download-processor.min.js: \
	web-js/download-processor/dist/ennuicastr-download-processor.min.js
	cp $< $@

web-js/download-processor/dist/ennuicastr-download-processor.min.js: \
	web-js/download-processor/src/*.ts
	cd web-js/download-processor && $(MAKE)

web/ecdssw.min.js: \
	web-js/download-processor/dist/ennuicastr-download-processor.min.js
	cp web-js/download-processor/node_modules/\@ennuicastr/dl-stream/dist/ecdssw.min.js $@

web/assets/js/localforage.min.js: \
	web-js/download-processor/dist/ennuicastr-download-processor.min.js
	cp web-js/download-processor/node_modules/localforage/dist/localforage.min.js $@

web/assets/libs/libspecbleach-0.1.7-js2.js: \
	web-js/download-processor/dist/ennuicastr-download-processor.min.js
	cp web-js/download-processor/node_modules/\@ennuicastr/libspecbleach.js/dist/libspecbleach-0.1.7-js2.* web/assets/libs/

web/assets/libs/yalap-1.0.1-zip.js: \
	web-js/download-processor/dist/ennuicastr-download-processor.min.js
	cp web-js/download-processor/node_modules/yalap.js/dist/yalap-1.0.1-zip.* web/assets/libs/

node_modules/.bin/tsc:
	npm install

%: %.c
	$(CC) $(CFLAGS) $< -o $@
