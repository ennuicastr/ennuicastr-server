<?JS!
/*
 * Copyright (c) 2020-2024 Yahweasel
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

const {rid, recInfo, recInfoExtra, hasCaptionsFile, showDL} = arguments[1];
?>

<header><h3>Transcript</h3></header>

<?JS
if (hasCaptionsFile) {
?>
    <p><?JS showDL("vtt"); ?></p>
<?JS
} else if (recInfo.transcription) {
?>
<p>Transcript generated while recording:<br/><?JS showDL("vtt"); ?></p>
<?JS } ?>

<?JS
if (!recInfoExtra || !recInfoExtra.captionImprover) {
?>
<p><a class="button" href="<?JS= `?i=${recInfo.rid.toString(36)}&amp;captionImprover=1` ?>">Transcribe speech</a></p>

<p><span style="display: inline-block; max-width: 50em;">NOTE: Transcriptions are inferred by OpenAI Whisper. If you choose to generate a transcription, your audio data will be sent to a server operated by <a href="https://www.runpod.io/">RunPod</a>. Consult <a href="https://www.runpod.io/legal/privacy-policy">their privacy policy</a> for further information.</p>
<?JS } ?>

<p>&nbsp;</p>
