#!/bin/sh
set -ex
test -d fragments
./mkconfig.js ecdl '[
    "format-ogg", "format-webm", "format-mp4", "muxer-ismv", "muxer-adts",
    "format-flac", "format-wav",
    "codec-libopus", "codec-flac", "codec-pcm_f32le",
    "encoder-aac", "encoder-alac", "encoder-pcm_s16le",
    "audio-filters", "filter-asetpts", "filter-asplit", "filter-concat"
]'
