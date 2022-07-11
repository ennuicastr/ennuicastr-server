# Installation

This document describes how to install an Ennuicastr server. It is based on an
example installation on a Debian 11 server, but most of the steps should
generalize. You will need a Unix server and a few domain names.

In this example, we're using `testbed.ecastr.com` for the server panel,
`r.testbed.ecastr.com` for the client, and `jitsi.r.testbed.ecastr.com` for the
Jitsi meet instance. Note that the domain for Jitsi *must* be `jitsi.` followed
by the domain for the client.


## 1: Prerequisites

The Ennuicastr server requires a web server (we'll be using nginx in this
demonstration), Node.js, development tools to compile the C sources, curl,
zip/unzip, SQLite3, at, and a variety of tools for encoding audio. The web server
will require SSL, for which we'll be using certbot (letsencrypt) in this
document. We'll need `git` to get Ennuicastr and such.  Finally, this example
will use `lndir` as a convenience tool, which is for historical reasons in
`xutils-dev` (but does not require X.org).

You should probably consider installing the nodesource repository for Node.js
LTS, instead of using the often outdated version in Debian:
https://github.com/nodesource/distributions/blob/master/README.md

```
sudo apt install nginx nodejs npm build-essential curl zip unzip sqlite3 at \
    certbot python3-certbot-nginx git xutils-dev ffmpeg flac vorbis-tools \
    fdkaac opus-tools
```


## 2: Install Jitsi

Follow Jitsi's own installation instructions at
https://jitsi.github.io/handbook/docs/devops-guide/devops-guide-quickstart .
Make sure you use the correct domain name. Just use the default self-signed
certificate; we'll be installing a proper certificate in a moment.

NOTE: The current version of Jitsi (as of the time that this paragraph was
written) breaks compatibility with Safari on iOS. I recommend manually fetching
the versions that were upload to the repository on 2021-06-10. Specifically:
```
22799076 Jun 10 18:28 jicofo_1.0-756-1_all.deb
    3348 Jun 10 18:28 jitsi-meet_2.0.5963-1_all.deb
   53388 Jun 10 18:28 jitsi-meet-prosody_1.0.5056-1_all.deb
11383324 Jun 10 18:28 jitsi-meet-web_1.0.5056-1_all.deb
   19252 Jun 10 18:28 jitsi-meet-web-config_1.0.5056-1_all.deb
36064676 Jun 10 18:28 jitsi-videobridge2_2.1-508-gb24f756c-1_all.deb
```

The Jitsi installation will generate an nginx configuration file named
something like `/etc/nginx/sites-enabled/jitsi.r.testbed.ecastr.com.conf` . In
it, there is a subsection for `/xmpp-websocket`. It must be modified to allow
connections from the client, like so:

```
...
        add_header 'Access-Control-Allow-Origin' 'https://r.testbed.ecastr.com';
        add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range';
...
```

A complete `/xmpp-websocket` configuration section looks like this:

```
    # xmpp websockets
    location = /xmpp-websocket {
        proxy_pass http://127.0.0.1:5280/xmpp-websocket?prefix=$prefix&$args;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $http_host;
        add_header 'Access-Control-Allow-Origin' 'https://r.testbed.ecastr.com';
        add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range';
        tcp_nodelay on;
    }
```

You should disable the default web site on Jitsi. The simplest way to do this
is to reject connections to /, by adding the following section to the site
configuration:

```
    location = / {
        return 301 https://testbed.ecastr.com/;
    }
```

You should also disable the channel web site on Jitsi. In the configuration
file, there will be a section for the pseudo-location `@root_path`. Rewrite it
to redirect to your home page, like so:

```
    location @root_path {
        #rewrite ^/(.*)$ / break;
        return 301 https://testbed.ecastr.com/;
    }
```


## 3: Configure Prosody

Jitsi relies on Prosody as its underlying comms server. We need to set up
Prosody to use WebSockets. The configuration is done automatically for nginx,
but still needs to be done in Prosody itself.

The Jitsi installation will generate an nginx configuration file named
something like `/etc/prosody/conf.d/jitsi.r.testbed.ecastr.com.cfg.lua` . In
it, we need to do two things. First, at the global level, add these two
directives:

```
cross_domain_websocket = true;
consider_websocket_secure = true;
```

Second, in the subsection `modules_enabled` for the relevant host, you need to
add the `"websocket"` module.


## 4: User configuration

A single user should run everything related to Ennuicastr. In this example,
that user will be `ennuicastr`:

```
sudo adduser ennuicastr
```


## 5: Web server configuration (basic)

Ennuicastr requires two major domain names: one for the server panel and one
for the client. On the canonical implementation, these are `ennuicastr.com` and
`weca.st`. In this example, we'll be using `testbed.ecastr.com` and
`r.testbed.ecastr.com`.

In `/etc/nginx/sites-enabled/default`, set `server_name` to `testbed.ecastr.com`:

```
...
	server_name testbed.ecastr.com;
...
```

In addition, we'll need a second vhost configuration for
`r.testbed.ecastr.com`, with a different root:

```
server {
	listen 80;
	listen [::]:80;

	server_name r.testbed.ecastr.com;

	root /var/www/rec;
	index index.html;

	add_header 'Cross-Origin-Opener-Policy' 'same-origin';
	add_header 'Cross-Origin-Embedder-Policy' 'require-corp';

	location / {
		try_files $uri $uri/ =404;
	}
}
```

The Cross-Origin headers are needed for [shared memory to work
properly](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer).

The web server needs to run as the selected user. In `/etc/nginx/nginx.conf`,
`user www-data` needs to be replaced:

```
user ennuicastr;
...
```

We can now start nginx:

```
sudo service nginx restart
```


## 6: SSL

Use `certbot` to install SSL certificates for the domain names. This is as
simple as running `certbot` and following its instructions. Make sure you
redirect the non-SSL server to the SSL server if `certbot` asks (this is
presently the default). `certbot` may also have small conflicts with the nginx
configuration made by Jitsi; simply comment out any line(s) it complains about.

You will need to configure a service to copy the certificates from
`/etc/letsencrypt/live/*` to `~ennuicastr/cert` periodically and chown them to
the Ennuicastr user.


## 7: Fetch and compile ennuicastr-server

As the `ennuicastr` user, fetch `ennuicastr-server`.

```
git clone https://github.com/ennuicastr/ennuicastr-server.git
```

Compile it.

```
cd ennuicastr-server
make
```


## 8: Make config.json

Copy `config.json.example` to `config.json` and modify it as needed.


## 9: Prepare the database

```
cd ~/ennuicastr-server/db
sqlite3 ennuicastr.db < ennuicastr.schema
sqlite3 log.db < log.schema
```


## 10: Run the server components

You should set up the server components to run automatically. To run them manually:

```
cd ~/ennuicastr-server/njsp
nohup ./njsp.sh &
cd ~/ennuicastr-server/server
nohup ./main.sh &
```


## 11: Web server configuration (full)

The web server needs to be able to run NJSP scripts and NJSP WebSocket
services. How to do so is documented at
https://github.com/Yahweasel/nodejs-server-pages , but in short, in
`sites-enabled/default`:

```
...
	index index.jss index.html;
...
	location ~ \.jss$ {
		fastcgi_pass unix:/tmp/nodejs-server-pages.sock;
		include fastcgi_params;
	}

	location ~ /ws$ {
		proxy_pass http://unix:/tmp/nodejs-server-pages-ws.sock;
		proxy_http_version 1.1;
		proxy_set_header Upgrade $http_upgrade;
		proxy_set_header Connection "Upgrade";
		proxy_set_header Host $host;
		proxy_read_timeout 86400;
		proxy_send_timeout 86400;
		send_timeout 86400;
	}
...
```

Both vhosts will require these components. Make sure to `sudo service nginx reload`.


## 12: Web content (server panel)

The content of `~/ennuicastr-server/web` must be accessible from the web server:

```
sudo chown -R ennuicastr:ennuicastr /var/www/html
lndir ~/ennuicastr-server/web /var/www/html
```

At this point, e.g. `https://testbed.ecastr.com/panel/` should work, though the
login services will only work if you configured them in `config.json`.


## 13: Fetch and compile ennuicastr

As the `ennuicastr` user, fetch `ennuicastr`.

```
git clone https://github.com/ennuicastr/ennuicastr.git
```

Compile it.

```
cd ennuicastr
make
```

The Ennuicastr client requires a version of `libav.js`, from
https://github.com/Yahweasel/libav.js/ , in the `libav` directory. This is
*not* installed automatically, because it's a long and involved compilation
process, and probably not something you should build on a server. Follow the
instructions in `libav/README` and `libav.js`'s own README.

Similarly, you'll need to install `noise-repellent-m.js*`, from
https://github.com/Yahweasel/noise-repellent.js , to `noise-repellent`.

You'll also need to get FontAwesome (https://fontawesome.com) version 5 (though
later versions should work) and extract it to `~/ennuicastr/fa`.


## 14: Web content (client)

The content of `~/ennuicastr` and `~/ennuicastr-server/web/rec` must be
accessible from the web server. First, we'll need to create the `/var/www/rec`
directory we used above:

```
sudo mkdir /var/www/rec
sudo chown ennuicastr:ennuicastr /var/www/rec
```

`ennuicastr` can be installed with `make install`. The default install prefix
is `inst` (in the `ennuicastr` directory). You can either `make install
PREFIX=/var/www/rec` or simply link `/var/www/rec` to `inst`.

Then, link in the server's components:

```
lndir ~/ennuicastr-server/web/rec /var/www/rec
```


## 15: More components

At this point, Ennuicastr should work. For improved captioning, you'll need
ennuicastr-vosk-daemon and ennuicastr-fastpunct-daemon .
