This is the server component for Ennuicastr, a system for recording multiple
users distributed across the world in a well-synchronized way, without
significant loss, over the web. This is the server software that runs
https://ecastr.com/ , the main installation of Ennuicastr.

This software is divided into several subcomponents:

db:     The database

njsp:   The configuration for NodeJS-Server-Pages
        (`npm install nodejs-server-pages`), which is needed to run the
        templated web site component.

server: The server for Ennuicastr recordings itself.

web:    The web page

cook:   Tools used to process raw audio into usable formats.


No complete documentation is provided on running your own instance of
Ennuicastr, but some notes are here, mainly for my own memory.


# Server requirements

The server has two main components: The Ennuicastr protocol server, and the web
components. The web components use
[nodejs-server-pages](https://github.com/Yahweasel/nodejs-server-pages), so
you'll need to set up your web server of choice to use that.

For nodejs-server-pages WebSockets to work, your web server needs to delegate
/ws accesses to it. In nginx, for example:
```
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
```

The client uses Jitsi to communicate, so you'll need to set up a Jitsi server.
If the client is at https://weca.st/ , then Jitsi must be at
https://jitsi.weca.st/ . That is, it must be at jitsi.X, where X is the domain
used for the client.

You can hide the actual Jitsi interface, since Ennuicastr provides its own. In
nginx, for example:
```
    location = / {
        return 301 https://ecastr.com/;
    }

...

    location @root_path {
        #rewrite ^/(.*)$ / break;
        return 301 https://ecastr.com/;
    }
```

Jitsi will also need correct CORS so that it can be connected to from another
domain. For instance, with nginx and weca.st:
```
    location = /http-bind {
...
        add_header 'Access-Control-Allow-Origin' 'https://weca.st';
        add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range';
    }
```
