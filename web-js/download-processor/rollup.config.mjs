import typescript from "@rollup/plugin-typescript";
import nodeResolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import terser from "@rollup/plugin-terser";

export default {
    input: "src/main.ts",
    output: [
        {
            file: "dist/ennuicastr-download-processor.js",
            format: "iife",
            name: "EnnuicastrDownloadProcessor"
        }, {
            file: "dist/ennuicastr-download-processor.min.js",
            format: "iife",
            name: "EnnuicastrDownloadProcessor",
            plugins: [terser()]
        }
    ],
    plugins: [
        typescript(),
        nodeResolve(),
        commonjs()
    ]
};
