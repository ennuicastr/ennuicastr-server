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

const chunkSize = 512;

/**
 * A decoding processor. Demuxes, decodes, and sends the data as float32
 * planar.
 */
export class DecoderProcessor extends proc.Processor<LibAVT.Frame[]> {
    /**
     * @param _name  Filename of input (only uniqueness matters).
     * @param _input  Input file to decode.
     * @param _duration  Expected duration.
     */
    constructor(
        private _name: string,
        private _input: proc.CorkableProcessor<Uint8Array>,
        private _duration: number
    ) {
        super(new wsp.ReadableStream<LibAVT.Frame[]>({
            pull: async (controller) => {
                if (!this._inputRdr) {
                    await _input.cork;
                    this._inputRdr = _input.stream.getReader();

                    // Create a libav instance
                    const la = this._la = await LibAV.libav("decoder");

                    await la.mkreaderdev(`input.${_name}`);

                    // Create a demuxer
                    const demuxPromise = la.ff_init_demuxer_file(`input.${_name}`);
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

                    let hadFilterFrames = false;

                    // Decode in manageable groups
                    for (let ci = 0; ci < packets.length; ci += chunkSize) {
                        // Decode it
                        const eof =
                            (rdRes === la.AVERROR_EOF) && (ci >= packets.length - chunkSize);
                        const decFrames = await la.ff_decode_multi(
                            this._c, this._pkt, this._frame, packets.slice(ci, ci + chunkSize),
                            eof
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
                                decFrames, eof
                            );
                        }

                        if (filterFrames.length)
                            hadFilterFrames = true;

                        // And send whatever data we got
                        if (filterFrames.length)
                            controller.enqueue(<LibAVT.Frame[]> filterFrames);

                        await new Promise(res => setImmediate(res));
                    }

                    if (rdRes === la.AVERROR_EOF) {
                        await this._free();
                        controller.close();
                        break;
                    }
                    if (hadFilterFrames)
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
                await la.ff_reader_dev_send(`input.${this._name}`, null);
            else
                await la.ff_reader_dev_send(`input.${this._name}`, rd.value);
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
