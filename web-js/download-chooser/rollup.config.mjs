import typescript from "@rollup/plugin-typescript";
import terser from "@rollup/plugin-terser";

export default {
    input: "src/chooser.ts",
    output: [
        {
            file: "dist/ennuicastr-download-chooser.js",
            format: "iife",
            name: "EnnuicastrDownloadChooser"
        }, {
            file: "dist/ennuicastr-download-chooser.min.js",
            format: "iife",
            name: "EnnuicastrDownloadChooser",
            plugins: [terser()]
        }
    ],
    plugins: [typescript()]
};
