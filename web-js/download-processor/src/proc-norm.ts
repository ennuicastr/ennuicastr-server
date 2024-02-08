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

export class NormalizeProcessor extends proc.Processor<LibAVT.Frame[]> {
    constructor(private _input: proc.Processor<LibAVT.Frame[]>) {
        super(new wsp.ReadableStream<LibAVT.Frame[]>({
            pull: async (controller) => {
                if (!this._inputRdr)
                    this._inputRdr = _input.stream.getReader();

                while (true) {
                    const rd = await this._inputRdr.read();

                    if (!this._la)
                        this._la = await LibAV.libav("normalize");
                    const la = this._la;
                    if (!this._frame)
                        this._frame = await la.av_frame_alloc();
                    if (!this._filterGraph) {
                        let frames = rd.value;
                        if (!frames || !frames.length) {
                            frames = [{
                                data: [new Float32Array(0)],
                                format: la.AV_SAMPLE_FMT_FLTP,
                                sample_rate: 48000,
                                channel_layout: 4
                            }];
                        }
                        [
                            this._filterGraph, this._bufferSrc, this._bufferSink
                        ] = await la.ff_init_filter_graph(
                            "asplit[a][b];" +
                            "[a]apad=whole_dur=16,atrim=0:16[a];" +
                            "[a][b]concat=v=0:a=1,dynaudnorm,atrim=16,asetpts=PTS-STARTPTS",
                        {
                            sample_rate: frames[0].sample_rate,
                            sample_fmt: frames[0].format,
                            channel_layout: frames[0].channel_layout
                        }, {
                            sample_rate: frames[0].sample_rate,
                            sample_fmt: frames[0].format,
                            channel_layout: frames[0].channel_layout
                        });
                    }

                    const filterFrames = await la.ff_filter_multi(
                        this._bufferSrc, this._bufferSink, this._frame,
                        rd.done ? [] : rd.value, rd.done
                    );
                    if (filterFrames.length)
                        controller.enqueue(filterFrames);

                    if (rd.done) {
                        if (this._filterGraph)
                            await la.avfilter_graph_free_js(this._filterGraph);

                        if (this._frame)
                            await la.av_frame_free_js(this._frame);

                        controller.close();
                        break;

                    } else if (filterFrames.length)
                        break;
                }
            }
        }));
    }

    private _inputRdr: wsp.ReadableStreamDefaultReader<LibAVT.Frame[]>;
    private _la: LibAVT.LibAV;
    private _frame: number;
    private _filterGraph: number;
    private _bufferSrc: number;
    private _bufferSink: number;
}
