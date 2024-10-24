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
 * A video retiming processor. Demuxes and time-adapts, sending the data as
 * libav packets.
 */
export class VideoTimerProcessor extends proc.Processor<LibAVT.Packet[]> {
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
        super(new wsp.ReadableStream<LibAVT.Packet[]>({
            pull: async (controller) => {
                if (!this._inputRdr) {
                    await _input.cork;
                    this._inputRdr = _input.stream.getReader();

                    // Create a libav instance
                    const la = this._la = await LibAV.libav("decoder");

                    const filename = `vinput.${_name}`;
                    await la.mkreaderdev(filename);
                    la.ecSharedReaders![filename] = async () => {
                        const rd = await this._inputRdr.read();
                        if (rd.done)
                            await la.ff_reader_dev_send(filename, null);
                        else
                            await la.ff_reader_dev_send(filename, rd.value);
                    };

                    // Create a demuxer
                    const [fmtCtx, streams] =
                        await la.ff_init_demuxer_file(filename);
                    this._fmtCtx = fmtCtx;

                    // Look for the video stream
                    let streamIdx = 0;
                    for (; streamIdx < streams.length; streamIdx++) {
                        if (streams[streamIdx].codec_type ===
                            la.AVMEDIA_TYPE_VIDEO)
                            break;
                    }
                    const stream = this._stream = streams[streamIdx];

                    /* Look for the secondary video stream, which just contains
                     * blank packets for replication */
                    let blankStreamIdx = streamIdx + 1;
                    for (; blankStreamIdx < streams.length; blankStreamIdx++) {
                        if (streams[blankStreamIdx].codec_type ===
                            la.AVMEDIA_TYPE_VIDEO)
                            break;
                    }

                    // Get some initial frames
                    const [rdRes, allPackets] = await la.ff_read_frame_multi(
                        this._fmtCtx, this._pkt, {limit: 16*1024*1024}
                    );

                    // Maybe set up blank frames
                    const mainPkts = allPackets[streamIdx];
                    if (mainPkts && mainPkts.length) {
                        // Attempt to guess the framerate
                        let framerate = 60;
                        if (mainPkts.length >= 3) {
                            const firstPts =
                                mainPkts[1].pts *
                                stream.time_base_num /
                                stream.time_base_den;
                            const lastPts =
                                mainPkts[mainPkts.length - 1].pts *
                                stream.time_base_num /
                                stream.time_base_den;
                            const ct = mainPkts.length - 2;
                            const cfr = Math.round(
                                1 / ((lastPts - firstPts) / ct)
                            );
                            if (cfr > 0 && cfr < 1024)
                                framerate = cfr;
                        }
                        this._framerate = framerate;

                        // Adjust the first packet based on the framerate
                        if (mainPkts.length >= 2) {
                            const secondPts =
                                mainPkts[1].pts *
                                stream.time_base_num /
                                stream.time_base_den;
                            const firstPts = secondPts - (1/framerate);
                            const pts = la.f64toi64(Math.round(
                                firstPts *
                                stream.time_base_den /
                                stream.time_base_num
                            ));
                            mainPkts[0].pts = mainPkts[0].dts = pts[0];
                            mainPkts[0].ptshi = mainPkts[0].dtshi = pts[1];
                        }

                        // Get the current last time
                        {
                            const lastPkt = mainPkts[mainPkts.length-1];
                            this._lastPTS = [lastPkt.pts, lastPkt.ptshi];
                        }

                        // Guess blank packets
                        const blankPkts = [mainPkts[0]];
                        for (let i = 1; i < mainPkts.length; i++) {
                            const pkt = mainPkts[i];
                            if (pkt.flags & 1 /* KEY */)
                                break;
                            blankPkts.push(pkt);
                        }
                        this._blankPkts = blankPkts;
                    }

                    {
                        const blankPkts = allPackets[blankStreamIdx];
                        if (blankPkts && blankPkts.length)
                            this._blankPkts = blankPkts;
                    }

                    /* Figure out how many blank packets are needed based on
                     * the first real frame. */
                    this._blankEnd = false;
                    this._blankTime = 0;
                    if (mainPkts && mainPkts.length) {
                        const firstPts =
                            mainPkts[0].pts *
                            stream.time_base_num /
                            stream.time_base_den;
                        this._blankCt = Math.round(firstPts * this._framerate);
                    } else {
                        this._blankCt = 0;
                    }

                    // Save the packets we just read for future passthru
                    this._queuePackets = mainPkts;
                }

                // If we need to send blank packets, do so
                if (this._blankCt || this._blankEnd) {
                    const ret: LibAVT.Packet[] = [];
                    const stream = this._stream;
                    let sent = 0;
                    for (; sent < 1024 && sent < this._blankCt; sent++) {
                        let pkt = this._blankPkts[sent % this._blankPkts.length];
                        pkt = Object.assign({}, pkt);
                        const pts = this._la.f64toi64(Math.round(
                            this._blankTime *
                            stream.time_base_den /
                            stream.time_base_num
                        ));
                        pkt.pts = pkt.dts = pts[0];
                        pkt.ptshi = pkt.dtshi = pts[1];
                        this._blankTime += 1 / this._framerate;
                        ret.push(pkt);
                    }
                    this._blankCt -= sent;
                    if (sent)
                        controller.enqueue(ret);

                    if (this._blankEnd && !this._blankCt) {
                        await this._free();
                        controller.close();
                    }

                    return;
                }

                // Send the packets queued for after the blank, if applicable
                if (this._queuePackets) {
                    controller.enqueue(this._queuePackets);
                    this._queuePackets = void 0;
                    return;
                }

                while (true) {
                    const la = this._la;

                    // Read some data
                    const [rdRes, allPackets] = await la.ff_read_frame_multi(
                        this._fmtCtx, this._pkt, {limit: 1024*1024}
                    );
                    const packets = allPackets[this._stream.index];

                    if (rdRes !== 0 &&
                        rdRes !== -la.EAGAIN &&
                        rdRes !== la.AVERROR_EOF)
                        throw new Error(await la.ff_error(rdRes));

                    let hadFrames = false;
                    if (packets && packets.length) {
                        hadFrames = true;
                        controller.enqueue(packets);
                        {
                            const lastPkt = packets[packets.length-1];
                            this._lastPTS = [lastPkt.pts, lastPkt.ptshi];
                        }
                    }

                    if (rdRes === la.AVERROR_EOF) {
                        // Fill in the end with blanks
                        this._blankEnd = true;
                        this._blankTime =
                            this._la.i64tof64(this._lastPTS[0], this._lastPTS[1]) *
                            this._stream.time_base_num /
                            this._stream.time_base_den +
                            1/this._framerate;
                        this._blankCt = Math.round(
                            (_duration - this._blankTime) * this._framerate
                        );
                        break;
                    }
                    if (hadFrames)
                        break;
                }
            }
        }));
    }

    /**
     * Get the codec parameters for this stream.
     */
    async codecpar(): Promise<[LibAVT.CodecParameters, number, number]> {
        return [
            await this._la.ff_copyout_codecpar(this._stream.codecpar),
            this._stream.time_base_num,
            this._stream.time_base_den
        ];
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

    private _framerate: number;
    private _blankPkts: LibAVT.Packet[];
    private _blankCt: number;
    private _blankTime: number;
    private _blankEnd: boolean;
    private _lastPTS: [number, number];
    private _queuePackets?: LibAVT.Packet[];
}
