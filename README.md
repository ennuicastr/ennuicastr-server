This is the server component for Ennuicastr, a system for recording multiple
users distributed across the world in a well-synchronized way, without
significant loss, over the web. This is the server software that runs
https://ennuicastr.com/ , the main installation of Ennuicastr.

This software is divided into several subcomponents:

db:     The database

njsp:   The configuration for NodeJS-Server-Pages
        (`npm install nodejs-server-pages`), which is needed to run the
        templated web site component.

server: The server for Ennuicastr recordings itself.

web:    The web page
