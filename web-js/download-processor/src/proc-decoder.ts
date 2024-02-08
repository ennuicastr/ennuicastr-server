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

/**
 * A decoding processor. Demuxes, decodes, and sends the data as float32
 * planar.
 */
export class DecoderProcessor extends proc.Processor<LibAVT.Frame[]> {
    /**
     * @param _input  Input file to decode.
     * @param _duration  Expected duration
     */
    constructor(
        private _input: proc.Processor<Uint8Array>,
        private _duration: number
    ) {
        super(new wsp.ReadableStream<LibAVT.Frame[]>({
            pull: async (controller) => {
                if (!this._inputRdr) {
                    this._inputRdr = _input.stream.getReader();

                    // Create a libav instance
                    const la = this._la = await LibAV.libav("decoder");

                    await la.mkreaderdev("input");

                    // Create a demuxer
                    const demuxPromise = la.ff_init_demuxer_file("input");
                    await this._flushReaderDev();
                    const [fmtCtx, streams] = await demuxPromise;
                    this._fmtCtx = fmtCtx;

                    // Look for the audio stream
                    let streamIdx = 0;
                    for (; streamIdx < streams.length; streamIdx++) {
                        if (streams[streamIdx].codec_type ===
                            la.AVMEDIA_TYPE_AUDIO)
                            break;
                    }
                    const stream = this._stream = streams[streamIdx];

                    // Create the decoder
                    [, this._c, this._pkt, this._frame] =
                        await la.ff_init_decoder(
                            stream.codec_id, stream.codecpar
                        );
                }

                while (true) {
                    const la = this._la;

                    // Read some data
                    const rdPromise = la.ff_read_multi(
                        this._fmtCtx, this._pkt, void 0, {limit: 1024*1024}
                    );
                    await this._flushReaderDev();
                    const [rdRes, allPackets] = await rdPromise;
                    const packets = allPackets[this._stream.index] || [];

                    if (rdRes !== 0 &&
                        rdRes !== -la.EAGAIN &&
                        rdRes !== la.AVERROR_EOF)
                        throw new Error(await la.ff_error(rdRes));

                    // Decode it
                    const decFrames = await la.ff_decode_multi(
                        this._c, this._pkt, this._frame, packets,
                        (rdRes === la.AVERROR_EOF)
                    );

                    // Maybe initialize the filter
                    if (decFrames.length && !this._filterGraph) {
                        const ff = decFrames[0];
                        [
                            this._filterGraph, this._bufferSrc,
                            this._bufferSink
                        ] = await la.ff_init_filter_graph(
                            `asetpts=PTS-STARTPTS,apad,atrim=0:${_duration}`, {
                            sample_rate: ff.sample_rate,
                            sample_fmt: ff.format,
                            channel_layout: ff.channel_layout
                        }, {
                            sample_rate: ff.sample_rate,
                            sample_fmt: la.AV_SAMPLE_FMT_FLTP,
                            channel_layout: ff.channel_layout
                        });
                    }

                    // Filter it
                    let filterFrames = decFrames;
                    if (this._filterGraph) {
                        filterFrames = await la.ff_filter_multi(
                            this._bufferSrc, this._bufferSink, this._frame,
                            decFrames, (rdRes === la.AVERROR_EOF)
                        );
                    }

                    // And send whatever data we got
                    if (filterFrames.length)
                        controller.enqueue(<LibAVT.Frame[]> filterFrames);
                    if (rdRes === la.AVERROR_EOF) {
                        await this._free();
                        controller.close();
                        break;
                    }
                    if (filterFrames.length)
                        break;
                }
            }
        }));
    }

    /**
     * Send as much data as the reader device demands.
     * @private
     */
    private async _flushReaderDev() {
        const la = this._la;
        while (await la.ff_reader_dev_waiting()) {
            const rd = await this._inputRdr.read();
            if (rd.done)
                await la.ff_reader_dev_send("input", null);
            else
                await la.ff_reader_dev_send("input", rd.value);
        }
    }

    /**
     * Clean up.
     * @private
     */
    private async _free() {
        const la = this._la;

        if (this._filterGraph) {
            await la.avfilter_graph_free_js(this._filterGraph);
            this._filterGraph = 0;
        }

        if (this._c) {
            await la.ff_free_decoder(this._c, this._pkt, this._frame);
            this._c = 0;
        }

        if (this._fmtCtx) {
            await la.avformat_free_context(this._fmtCtx);
            this._fmtCtx = 0;
        }
    }

    private _inputRdr: wsp.ReadableStreamDefaultReader<Uint8Array>;
    private _la: LibAVT.LibAV | null;
    private _fmtCtx: number;
    private _stream: LibAVT.Stream;
    private _c: number;
    private _pkt: number
    private _frame: number;
    private _filterGraph: number;
    private _bufferSrc: number;
    private _bufferSink: number;
}
