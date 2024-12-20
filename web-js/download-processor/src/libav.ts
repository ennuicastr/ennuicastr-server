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

const libavPromises: Record<string, Promise<LibAVT.LibAV>> = Object.create(null);

/**
 * Get a (shared) libav instance.
 * @param name  Shared name. All instances with the same name use the same worker.
 */
export async function libav(name: string) {
    // If we don't have much memory, don't make multiple instances
    if (!(<any> navigator).deviceMemory || (<any> navigator).deviceMemory < 1)
        name = "shared";

    if (!(name in libavPromises))
        libavPromises[name] = LibAV.LibAV();
    return await libavPromises[name];
}
