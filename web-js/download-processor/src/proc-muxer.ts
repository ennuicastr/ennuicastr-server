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
import * as pEnc from "./proc-encoder";
import * as pVidT from "./proc-video-timer";

import type * as LibAVT from "libav.js";
import * as wsp from "web-streams-polyfill/ponyfill";

const sharedWriters: Record<
    string, (pos: number, buf: Uint8Array | Int8Array) => void
> = Object.create(null);

export class MuxerProcessor extends proc.Processor<Uint8Array> {
    constructor(
        private _name: string,
        private _input: (pEnc.EncoderProcessor|pVidT.VideoTimerProcessor)[],
        private _duration: number,
        private _format: string,
        onprogress?: (time: number) => unknown
    ) {
        super(new wsp.ReadableStream<Uint8Array>({
            pull: async (controller) => {
                if (!this._inputRdr) {
                    this._inputRdr = this._input.map(x => x.stream.getReader());
                    this._inputBufs = new Array(this._input.length);
                    this._codecpars = new Array(this._input.length);
                }

                if (!this._la) {
                    this._la = await LibAV.libav("muxer");
                    this._la.onwrite = (name, pos, buf) => {
                        if (sharedWriters[name])
                            sharedWriters[name](pos, buf);
                    };
                }
                const la = this._la;

                while (true) {
                    let done = true;

                    // Get packets and find our range
                    let lastTime = 1/0;
                    for (let i = 0; i < this._input.length; i++) {
                        if (!this._inputBufs[i]) {
                            const rd = await this._inputRdr[i].read();
                            if (rd.done) {
                                this._inputBufs[i] = "eof";
                            } else {
                                for (const pkt of rd.value)
                                    pkt.stream_index = i;
                                this._inputBufs[i] = rd.value;
                            }
                        }

                        // Timebase
                        let codecpar = this._codecpars[i];
                        if (!codecpar) {
                            codecpar = this._codecpars[i] =
                                await this._input[i].codecpar();
                        }

                        const buf = this._inputBufs[i];
                        if (buf && buf !== "eof") {
                            const pkt = buf[buf.length - 1];
                            const pts = la.i64tof64(pkt.pts, pkt.ptshi) *
                                codecpar[1] / codecpar[2];
                            if (pts < lastTime)
                                lastTime = pts;
                            done = false;
                        }
                    }

                    // Combine the safe subset of them
                    let packets: LibAVT.Packet[] = [];
                    for (let i = 0; i < this._input.length; i++) {
                        const buf = this._inputBufs[i];
                        if (!buf || buf === "eof")
                            continue;
                        const codecpar = this._codecpars[i];

                        let last = 0;
                        for (; last < buf.length; last++) {
                            const pkt = buf[last];
                            const pts = la.i64tof64(pkt.pts, pkt.ptshi) *
                                codecpar[1] / codecpar[2];
                            if (pts > lastTime)
                                break;
                        }

                        if (last) {
                            packets = packets.concat(buf.slice(0, last));
                            if (last >= buf.length)
                                this._inputBufs[i] = void 0;
                            else
                                this._inputBufs[i] = buf.slice(last);
                        }
                    }

                    // Open for writing if applicable
                    this._hadWrite = false;
                    if (!this._fmtCtx) {
                        // Determine our codec parameters and compatibility
                        let codecpars: [number, number, number][] = [];
                        for (const cp of this._codecpars) {
                            const cpptr = await la.avcodec_parameters_alloc();
                            if (cp) {
                                await la.ff_copyin_codecpar(cpptr, cp[0]),
                                codecpars.push([
                                    cpptr, cp[1], cp[2]
                                ]);
                            } else {
                                codecpars.push([
                                    cpptr, 1, 1000
                                ]);
                            }
                        }

                        sharedWriters[`output.${_name}`] = (pos, buf) => {
                            this._hadWrite = true;
                            controller.enqueue(new Uint8Array(buf.buffer));
                        };

                        [this._fmtCtx,] = await la.ff_init_muxer({
                            format_name: _format,
                            filename: `output.${_name}`,
                            device: true,
                            open: true,
                            codecpars: true
                        }, codecpars);

                        // Set delay_moov for ISMV
                        if (_format === "ismv") {
                            await la.av_opt_set(
                                this._fmtCtx, "movflags", "delay_moov", 0
                            );
                        }

                        // Set the duration (needed here for some formats)
                        for (let i = 0; i < this._input.length; i++) {
                            const st = await la.AVFormatContext_streams_a(
                                this._fmtCtx, i
                            );
                            let cp = this._codecpars[i] || [null, 1, 1000];
                            const dur = Math.floor(_duration * cp[2] / cp[1]);
                            const dur64 = la.f64toi64(dur);
                            await la.AVStream_duration_s(st, dur64[0]);
                            await la.AVStream_durationhi_s(st, dur64[1]);
                        }

                        await la.avformat_write_header(this._fmtCtx, 0);

                        this._pkt = await la.av_packet_alloc();
                    }

                    packets = packets.sort((a, b) => {
                        const acp = this._codecpars[a.stream_index];
                        const bcp = this._codecpars[b.stream_index];
                        const adts = la.i64tof64(a.dts, a.dtshi) *
                            acp[1] / acp[2];
                        const bdts = la.i64tof64(b.dts, b.dtshi) *
                            bcp[1] / bcp[2];
                        return adts - bdts;
                    });

                    // Report progress
                    if (packets.length && onprogress) {
                        const pkt = packets[0];
                        const cp = this._codecpars[pkt.stream_index] || [null, 1, 1000];
                        onprogress(
                            la.i64tof64(pkt.pts, pkt.ptshi) * cp[1] / cp[2]
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
                                let cp = this._codecpars[packet.stream_index] ||
                                    [null, 1, 1000];
                                ts *= 10000000 * cp[1] / cp[2];
                                const ts64 = la.f64toi64(ts);
                                packet[part] = ts64[0];
                                packet[part + "hi"] = ts64[1];
                            }
                        }
                    }

                    await la.ff_write_multi(
                        this._fmtCtx, this._pkt, packets, done
                    );

                    if (done) {
                        await la.av_write_trailer(this._fmtCtx);

                        await la.avformat_free_context(this._fmtCtx);

                        controller.close();
                        break;
                    } else if (this._hadWrite) {
                        break;
                    }
                }
            }
        }));
    }

    private _inputRdr: wsp.ReadableStreamDefaultReader<LibAVT.Packet[]>[];
    private _inputBufs: (LibAVT.Packet[]|undefined|"eof")[];
    private _codecpars: [LibAVT.CodecParameters, number, number][];
    private _la: LibAVT.LibAV;
    private _pkt: number;
    private _fmtCtx: number;
    private _hadWrite: boolean;
}
