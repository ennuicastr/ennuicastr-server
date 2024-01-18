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

import * as wsp from "web-streams-polyfill/ponyfill";

/**
 * A step in a processing chain. Defined by what kind of data it outputs.
 */
export class Processor<T> {
    /**
     * Simple default constructor that just takes the ReadableStream as an
     * argument.
     */
    constructor(
        /**
         * The output stream of data coming from this filter.
         */
        public stream: wsp.ReadableStream<T>
    ) {}
}

/**
 * A processor that starts "corked" and can be "uncorked" when needed. To
 * implement, wait on cork in the ReadableStream's pull.
 */
export class CorkableProcessor<T> extends Processor<T> {
    constructor(stream: wsp.ReadableStream<T>) {
        super(stream);
        this.cork = new Promise<void>(res => this._corkRes = res);
    }

    /**
     * Call to uncork.
     */
    public uncork() {
        if (this._corkRes) {
            this._corkRes();
            this._corkRes = null;
        }
    }

    /**
     * The cork. Resolved when this processor is ready to stream.
     */
    public cork: Promise<void>;

    private _corkRes: () => unknown | null;
}

/**
 * A processor that simply uncorks another processor when it's first read.
 */
export class PopProcessor<T, U> extends Processor<U> {
    constructor(
        public corkedInputStream: CorkableProcessor<T>,
        public outputStream: Processor<U>
    ) {
        let rdr: wsp.ReadableStreamDefaultReader<U> | null = null;
        super(new wsp.ReadableStream({
            pull: async (controller) => {
                if (!rdr) {
                    corkedInputStream.uncork();
                    rdr = outputStream.stream.getReader();
                }
                const rd = await rdr.read();
                if (rd.done)
                    controller.close();
                else
                    controller.enqueue(rd.value);
            }
        }, {highWaterMark: 0}));
    }
}
