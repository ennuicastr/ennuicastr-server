CC=gcc
CFLAGS=-O3

all: rec sounds \
	server/ennuicastr.js \
        cook/oggcorrect cook/oggduration cook/oggmeta cook/oggstender \
        cook/oggtracks cook/wavduration

test: server/ennuicastr-beta.js

rec sounds:
	mkdir -p $@

server/ennuicastr.js server/ennuicastr-beta.js: server/ennuicastr.ts node_modules/.bin/tsc
	node_modules/.bin/tsc $< --outFile $@.tmp
	mv $@.tmp $@

node_modules/.bin/tsc:
	npm install

%: %.c
	$(CC) $(CFLAGS) $< -o $@
