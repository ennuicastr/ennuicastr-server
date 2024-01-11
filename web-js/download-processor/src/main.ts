// SPDX-License-Identifier: ISC
/*!
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

import * as conductor from "./conductor";
import * as pFetch from "./proc-fetch";
import * as pDecoder from "./proc-decoder";
import * as pNoiser from "./proc-noiser";
import * as pNorm from "./proc-norm";
import * as pEncoder from "./proc-encoder";
import * as pSave from "./proc-save";

import * as downloadStream from "@ennuicastr/dl-stream";

export const dsLoad = downloadStream.load;

export const download = conductor.download;

export type FetchProcessor = pFetch.FetchProcessor;
export const FetchProcessor = pFetch.FetchProcessor
export type DecoderProcessor = pDecoder.DecoderProcessor;
export const DecoderProcessor = pDecoder.DecoderProcessor;
export type NoiserProcessor = pNoiser.NoiserProcessor;
export const NoiserProcessor = pNoiser.NoiserProcessor;
export type NormalizeProcessor = pNorm.NormalizeProcessor;
export const NormalizeProcessor = pNorm.NormalizeProcessor;
export type EncoderProcessor = pEncoder.EncoderProcessor;
export const EncoderProcessor = pEncoder.EncoderProcessor;
export type SaveProcessor = pSave.SaveProcessor;
export const SaveProcessor = pSave.SaveProcessor;
export type RestoreProcessor = pSave.RestoreProcessor;
export const RestoreProcessor = pSave.RestoreProcessor;
