/*
 * Copyright (c) 2017-2022 Yahweasel
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

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/types.h>
#include <unistd.h>

/* NOTE: We don't use libogg here because the behavior of this program is so
 * trivial, the added memory bandwidth of using it is just a waste of energy */

/* NOTE: This program assumes little-endian for speed. It WILL NOT WORK on a
 * big-endian system. */

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

// Read an Ogg packet
int readOgg(struct OggPreHeader *preHeader,
            struct OggHeader *oggHeader,
            unsigned char **buf,
            uint32_t *bufSz,
            uint32_t *packetSize)
{
    unsigned char segmentCount, segmentVal;

    // Check the pre-header
    if (readAll(0, preHeader, sizeof(*preHeader)) != sizeof(*preHeader))
        return 0;
    if (memcmp(preHeader->capturePattern, "OggS", 4))
        return 0;

    // It's an ogg header, get the header data
    if (readAll(0, oggHeader, sizeof(*oggHeader)) != sizeof(*oggHeader))
        return 0;

    // Get the data size
    *packetSize = 0;
    if (readAll(0, &segmentCount, 1) != 1)
        return 0;
    for (; segmentCount; segmentCount--) {
        if (readAll(0, &segmentVal, 1) != 1)
            return 0;
        *packetSize += (uint32_t) segmentVal;
    }

    // Get the data
    if (*packetSize > *bufSz) {
        *buf = realloc(*buf, *packetSize);
        if (!*buf)
            return 0;
        *bufSz = *packetSize;
    }
    if (readAll(0, *buf, *packetSize) != *packetSize)
        return 0;

    return 1;
}

int main(int argc, char **argv)
{
    // Size of our packet
    uint32_t packetSize;

    // Buffer info
    unsigned char *buf = NULL;
    uint32_t bufSz = 0;

    // Header
    struct OggPreHeader preHeader;
    struct OggHeader oggHeader;

    // Look for the first normal packet
    while (readOgg(&preHeader, &oggHeader, &buf, &bufSz, &packetSize)) {
        if (packetSize > 2 && !memcmp(buf, "\xFF\xF8", 2)) {
            int i;

            /* This is a data packet */
            printf("    { 0x%02X", packetSize);
            for (i = 0; i < packetSize; i++)
                printf(", 0x%02X", buf[i]);
            printf(" },\n");
            return 0;
        }
    }

    return 1;
}
