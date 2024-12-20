/*
 * Copyright (c) 2024 Yahweasel
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
 * SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
 * OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
 * CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

import * as LibAV from "./libav";
import * as proc from "./processor";

import type * as LibAVT from "libav.js";
import * as wsp from "web-streams-polyfill/ponyfill";

const sharedWriters: Record<
    string, (pos: number, buf: Uint8Array | Int8Array) => void
> = Object.create(null);

export class EncoderProcessor extends proc.Processor<Uint8Array> {
    constructor(
        private _name: string,
        private _input: proc.Processor<LibAVT.Frame[]>,
        private _duration: number,
        private _format: string, private _codec: string,
        private _codecCtx: LibAVT.AVCodecContextProps,
        onprogress?: (time: number) => unknown
    ) {
        let sampleRate: number;
        let buf: Uint8Array[] = [];
        let eof = false;
        super(new wsp.ReadableStream<Uint8Array>({
            pull: async (controller) => {
                if (!this._inputRdr)
                    this._inputRdr = this._input.stream.getReader();

                if (!this._la) {
                    this._la = await LibAV.libav("encoder");
                    this._la.onwrite = (name, pos, buf) => {
                        if (sharedWriters[name])
                            sharedWriters[name](pos, buf);
                    };
                }
                const la = this._la;

                while (true) {
                    if (buf.length) {
                        controller.enqueue(buf.shift());
                        break;
                    }

                    if (eof) {
                        controller.close();
                        break;
                    }

                    const rd = await this._inputRdr.read();
                    let frames = rd.value;

                    if (!this._c) {
                        if (!frames || !frames.length) {
                            // No input frames, make one up
                            frames = [{
                                data: [new Float32Array(0)],
                                sample_rate: 48000,
                                format: la.AV_SAMPLE_FMT_FLTP,
                                channel_layout: 4,
                                channels: 1
                            }];
                        }

                        // Initialize the encoder
                        sampleRate = frames[0].sample_rate;
                        const ctx = Object.assign({
                            sample_rate: frames[0].sample_rate,
                            channel_layout: frames[0].channel_layout
                        }, _codecCtx || {});
                        [, this._c, this._frame, this._pkt, this._frameSize] =
                            await la.ff_init_encoder(_codec, <any> {
                                ctx,
                                time_base: [1, frames[0].sample_rate]
                            });

                        // If this is flac, set the duration in the extradata
                        if (_codec === "flac") {
                            let dur = Math.floor(
                                _duration * frames[0].sample_rate
                            );
                            const exp = await la.AVCodecContext_extradata(
                                this._c
                            );
                            const exs = await la.AVCodecContext_extradata_size(
                                this._c
                            );
                            const ex = await la.copyout_u8(exp, exs);
                            /* streaminfo bytes 14 thru 17 are duration (plus 4
                             * bits of 13, but let's not worry about
                             * ultra-duration streams...) */
                            let idx = 17;
                            while (dur && idx >= 14) {
                                ex[idx] = dur & 0xFF;
                                dur >>= 8;
                                idx--;
                            }
                            await la.copyin_u8(exp, ex);
                        }
                    }

                    if (!this._filterGraph) {
                        // Initialize the filter
                        [
                            this._filterGraph, this._bufferSrc, this._bufferSink
                        ] = await la.ff_init_filter_graph("anull", {
                            sample_rate: frames[0].sample_rate,
                            sample_fmt: frames[0].format,
                            channel_layout: frames[0].channel_layout
                        }, {
                            sample_rate: frames[0].sample_rate,
                            sample_fmt: _codecCtx.sample_fmt,
                            channel_layout: frames[0].channel_layout,
                            frame_size: this._frameSize
                        });
                    }

                    if (!this._fmtCtx) {
                        sharedWriters[`output.${_name}`] = (pos, chunk) => {
                            if (chunk.byteOffset)
                                chunk = chunk.slice(0);
                            buf.push(new Uint8Array(chunk.buffer));
                        };

                        await la.mkstreamwriterdev(`output.${_name}`);

                        [this._fmtCtx, , this._pb] = await la.ff_init_muxer({
                            format_name: _format,
                            filename: `output.${_name}`,
                            open: true
                        }, [[this._c, 1, frames[0].sample_rate]]);

                        // Set delay_moov for ISMV
                        if (_format === "ismv") {
                            await la.av_opt_set(
                                this._fmtCtx, "movflags", "+frag_every_frame", la.AV_OPT_SEARCH_CHILDREN
                            );
                        }

                        // Set the duration (needed here for some formats)
                        const st = await la.AVFormatContext_streams_a(
                            this._fmtCtx, 0
                        );
                        const dur = Math.floor(_duration * frames[0].sample_rate);
                        const dur64 = la.f64toi64(dur);
                        await la.AVStream_duration_s(st, dur64[0]);
                        await la.AVStream_durationhi_s(st, dur64[1]);

                        await la.avformat_write_header(this._fmtCtx, 0);
                    }

                    // Convert the frame size
                    frames = await la.ff_filter_multi(
                        this._bufferSrc, this._bufferSink, this._frame,
                        rd.done ? [] : frames, rd.done
                    );

                    // Encode this data
                    const packets = await la.ff_encode_multi(
                        this._c, this._frame, this._pkt,
                        frames, rd.done
                    );

                    // Report progress
                    if (packets.length && onprogress) {
                        onprogress(
                            la.i64tof64(packets[0].pts, packets[0].ptshi) /
                            sampleRate
                        );
                    }

                    /* Bug related to ISMV in this implementation, it scales
                     * timestamps incorrectly and ends up creating weird
                     * behavior in the generated file. */
                    if (_format === "ismv") {
                        for (const packet of packets) {
                            for (const part of ["pts", "dts", "duration"]) {
                                if (!(part in packet)) continue;
                                let ts = la.i64tof64(
                                    packet[part], packet[part + "hi"]
                                );
                                ts *= 10000000 / sampleRate;
                                const ts64 = la.f64toi64(ts);
                                packet[part] = ts64[0];
                                packet[part + "hi"] = ts64[1];
                            }
                        }
                    }

                    await la.ff_write_multi(
                        this._fmtCtx, this._pkt, packets, rd.done
                    );

                    if (rd.done) {
                        await la.av_write_trailer(this._fmtCtx);

                        await la.ff_free_muxer(this._fmtCtx, this._pb);
                        await la.avfilter_graph_free_js(this._filterGraph);
                        await la.ff_free_encoder(
                            this._c, this._frame, this._pkt
                        );

                        eof = true;
                    }
                }
            }
        }));
    }

    private _inputRdr: wsp.ReadableStreamDefaultReader<LibAVT.Frame[]>;
    private _la: LibAVT.LibAV;
    private _c: number;
    private _frame: number;
    private _pkt: number;
    private _frameSize: number;
    private _filterGraph: number;
    private _bufferSrc: number;
    private _bufferSink: number;
    private _fmtCtx: number;
    private _pb: number;
}
