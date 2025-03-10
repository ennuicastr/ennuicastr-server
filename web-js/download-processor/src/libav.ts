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

import type * as LibAVT from "libav.js";
declare let LibAV: LibAVT.LibAVWrapper;

type SharedReaders = Record<
    string, (pos: number, len: number) => void
>;

type SharedWriters = Record<
    string, (pos: number, buf: Uint8Array | Int8Array) => void
>;

export type ShareableLibAV = LibAVT.LibAV & {
    ecSharedReaders?: SharedReaders,
    ecSharedWriters?: SharedWriters,
    ecFileIdx?: number
};

const libavPromises: Record<string, Promise<ShareableLibAV>> =
    Object.create(null);

/**
 * Get a (shared) libav instance.
 * @param name  Shared name. All instances with the same name use the same worker.
 */
export async function libav(name: string) {
    // If we don't have much memory, don't make multiple instances
    if (!(<any> navigator).deviceMemory || (<any> navigator).deviceMemory < 1)
        name = "shared";

    if (!(name in libavPromises)) {
        libavPromises[name] = LibAV.LibAV().then(async (la: ShareableLibAV) => {
            la.ecSharedReaders = Object.create(null);
            la.onread = (name, pos, len) => {
                if (la.ecSharedReaders![name])
                    la.ecSharedReaders![name](pos, len);
            };
            la.ecSharedWriters = Object.create(null);
            la.onwrite = (name, pos, buf) => {
                if (la.ecSharedWriters[name])
                    la.ecSharedWriters[name](pos, buf);
            };
            return la;
        });
    }
    return libavPromises[name];
}

/**
 * Get a fresh filename for this instance.
 */
export function freshName(libav: ShareableLibAV, prefix: string) {
    const idx = (libav.ecFileIdx || 0);
    libav.ecFileIdx = idx + 1;
    return `${prefix}${idx}`;
}
