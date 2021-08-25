/*
 * Copyright (c) 2017-2020 Yahweasel
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

#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/types.h>
#include <sys/select.h>
#include <unistd.h>

/* NOTE: We don't use libogg here because the behavior of this program is so
 * trivial, the added memory bandwidth of using it is just a waste of energy */

/* NOTE: This program assumes little-endian for speed, it WILL NOT WORK on a
 * big-endian system */

struct OggPreHeader {
    unsigned char capturePattern[4];
    unsigned char version;
} __attribute__((packed));

struct OggHeader {
    unsigned char type;
    uint64_t granulePos;
    uint32_t streamNo;
    uint32_t sequenceNo;
    uint32_t crc;
} __attribute__((packed));

ssize_t readAll(int fd, void *vbuf, size_t count)
{
    unsigned char *buf = (unsigned char *) vbuf;
    ssize_t rd = 0, ret;
    while (rd < count) {
        ret = read(fd, buf + rd, count - rd);
        if (ret <= 0) return ret;
        rd += ret;
    }
    return rd;
}

ssize_t writeAll(int fd, const void *vbuf, size_t count)
{
    const unsigned char *buf = (const unsigned char *) vbuf;
    ssize_t wt = 0, ret;
    while (wt < count) {
        ret = write(fd, buf + wt, count - wt);

        if (ret <= 0) {
            if (ret < 0 && errno == EAGAIN) {
                // Wait 'til we can write again
                fd_set wfds;
                FD_ZERO(&wfds);
                FD_SET(fd, &wfds);
                select(fd + 1, NULL, &wfds, NULL, NULL);
                continue;
            }

            perror("write");
            return ret;
        }
        wt += ret;
    }
    return wt;
}

int main(int argc, char **argv)
{
    int foundMeta = 0;
    uint32_t keepStreamNo;
    uint64_t granuleOffset = 0;
    uint32_t packetSize;
    unsigned char segmentCount, segmentVal;
    unsigned char *buf = NULL;
    uint32_t bufSz = 0;
    struct OggPreHeader preHeader;

    while (readAll(0, &preHeader, sizeof(preHeader)) == sizeof(preHeader)) {
        struct OggHeader oggHeader;
        if (memcmp(preHeader.capturePattern, "OggS", 4))
            break;

        // It's an ogg header, get the header data
        if (readAll(0, &oggHeader, sizeof(oggHeader)) != sizeof(oggHeader))
            break;

        // Get the data size
        packetSize = 0;
        if (readAll(0, &segmentCount, 1) != 1)
            break;
        for (; segmentCount; segmentCount--) {
            if (readAll(0, &segmentVal, 1) != 1)
                break;
            packetSize += (uint32_t) segmentVal;
        }

        // Get the data
        if (packetSize > bufSz) {
            buf = realloc(buf, packetSize);
            if (!buf)
                break;
            bufSz = packetSize;
        }
        if (readAll(0, buf, packetSize) != packetSize)
            break;

        // Handle headers
        if (oggHeader.granulePos == 0) {
            if (packetSize >= 8 && !memcmp(buf, "ECMETA", 6)) {
                // Found our meta track
                foundMeta = 1;
                keepStreamNo = oggHeader.streamNo;
            }
            continue;
        }

        // Get the offset if applicable
        if (!granuleOffset && oggHeader.granulePos)
            granuleOffset = oggHeader.granulePos;

        // Is this on our meta track?
        if (!foundMeta || oggHeader.streamNo != keepStreamNo)
            continue;

        // Adjust the granule pos
        if (oggHeader.granulePos < granuleOffset)
            continue;
        oggHeader.granulePos -= granuleOffset;

        // Now write it out
        printf("{\"t\":%lu,\"o\":%lu,\"d\":%.*s}\n", oggHeader.granulePos, granuleOffset, packetSize, buf);
    }

    return 0;
}
