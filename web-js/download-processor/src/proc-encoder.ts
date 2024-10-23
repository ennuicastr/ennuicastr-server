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

export class EncoderProcessor extends proc.Processor<LibAVT.Packet[]> {
    constructor(
        private _input: proc.Processor<LibAVT.Frame[]>,
        private _duration: number,
        private _codec: string,
        private _codecCtx: LibAVT.AVCodecContextProps
    ) {
        super(new wsp.ReadableStream<LibAVT.Packet[]>({
            pull: async (controller) => {
                if (!this._inputRdr)
                    this._inputRdr = this._input.stream.getReader();

                if (!this._la)
                    this._la = await LibAV.libav("encoder");
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

                    if (packets.length)
                        controller.enqueue(packets);

                    if (rd.done) {
                        await la.avfilter_graph_free_js(this._filterGraph);
                        await la.ff_free_encoder(
                            this._c, this._frame, this._pkt
                        );
                        controller.close();
                        break;
                    } else if (packets.length) {
                        break;
                    }
                }
            }
        }));
    }

    /**
     * Get the codec parameters for this stream.
     */
    async codecpar(): Promise<[LibAVT.CodecParameters, number, number]> {
        const la = this._la;
        const codecpar = await la.avcodec_parameters_alloc();
        await la.avcodec_parameters_from_context(codecpar, this._c);
        const codecparO = await this._la.ff_copyout_codecpar(codecpar);
        await this._la.avcodec_parameters_free_js(codecpar);
        return [
            codecparO,
            1, codecparO.sample_rate!
        ];
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
}
