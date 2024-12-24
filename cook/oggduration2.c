/*
 * Copyright (c) 2017-2024 Yahweasel
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

/* FIXME: This incomplete faster version of oggduration does not handle pausing
 * and does not adjust for offsets of the first timestamp. */

#include <fcntl.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>
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

int main(int argc, char **argv)
{
    int fd;
    struct stat sbuf;
    int32_t streamNo = -1;
    int foundMeta = 0;
    uint32_t metaStreamNo = 0;
    uint64_t firstGranulePos = 0, lastGranulePos = 0;
    uint64_t greatestGranulePos = 0, granuleOffset = 0;
    uint32_t packetSize;
    unsigned char segmentCount, segmentVal;
    unsigned char buf[1024];
    const uint32_t bufSz = 1024;
    struct OggPreHeader preHeader;
    off_t search;
    ssize_t rd;
    size_t i;

    if (argc >= 3)
        streamNo = atoi(argv[2]);

    fd = open(argv[1], O_RDONLY);
    if (fd < 0) {
        perror(argv[1]);
        printf("2\n");
        return 1;
    }

    if (fstat(fd, &sbuf) != 0) {
        perror(argv[1]);
        printf("2\n");
        return 1;
    }

    // Search progressively further back from the end
    for (search = 1024; search < sbuf.st_size * 2 && lastGranulePos == 0; search *= 2) {
        if (lseek(fd, -search, SEEK_END) < 0) {
            if (lseek(fd, 0, SEEK_SET) < 0) {
                fprintf(stderr, "Failed to find Ogg header\n");
                printf("2\n");
                return 1;
            }
        }
        
        while ((rd = readAll(fd, buf, bufSz)) > 0) {
            // Look for a likely header
            for (i = 0; i < rd; i++) {
                if (!memcmp(buf + i, "OggS", 4))
                    break;
            }

            if (i < rd) {
                // Found a header. Seek to it.
                if (lseek(fd, -rd + i, SEEK_CUR) < 0) {
                    perror(argv[1]);
                    printf("2\n");
                    return 1;
                }
                break;
            }
        }

        if (rd <= 0) {
            // Couldn't find a likely header
            continue;
        }

        // Then go through the data from this point
        while (readAll(fd, &preHeader, sizeof(preHeader)) == sizeof(preHeader)) {
            struct OggHeader oggHeader;
            if (memcmp(preHeader.capturePattern, "OggS", 4))
                break;

            // It's an ogg header, get the header data
            if (readAll(fd, &oggHeader, sizeof(oggHeader)) != sizeof(oggHeader))
                break;

            // Get the data size
            packetSize = 0;
            if (readAll(fd, &segmentCount, 1) != 1)
                break;
            for (; segmentCount; segmentCount--) {
                if (readAll(fd, &segmentVal, 1) != 1)
                    break;
                packetSize += (uint32_t) segmentVal;
            }

            // If it's zero-size, skip it entirely (timestamp reference)
            if (packetSize == 0)
                continue;

            // Skip the data
            while (packetSize > bufSz) {
                if (readAll(fd, buf, bufSz) != bufSz)
                    break;
                packetSize -= bufSz;
            }
            if (readAll(fd, buf, packetSize) != packetSize)
                break;

            if (!firstGranulePos && oggHeader.granulePos)
                firstGranulePos = oggHeader.granulePos;

            // Look for a meta track
            if (!foundMeta && oggHeader.granulePos == 0) {
                if (packetSize >= 8 && !memcmp(buf, "ECMETA", 6)) {
                    foundMeta = 1;
                    metaStreamNo = oggHeader.streamNo;
                }
            }

            // Check for unpausing and adjust
            if (oggHeader.granulePos > greatestGranulePos) {
                if (foundMeta && oggHeader.streamNo == metaStreamNo &&
                    !strncmp((char *) buf, "{\"c\":\"resume\"}", packetSize)) {
                    granuleOffset += oggHeader.granulePos - greatestGranulePos;
                }
                greatestGranulePos = oggHeader.granulePos;
            }

            if (streamNo >= 0 && oggHeader.streamNo != streamNo)
                continue;

            if (oggHeader.granulePos >= granuleOffset)
                oggHeader.granulePos -= granuleOffset;

            if (oggHeader.granulePos > lastGranulePos)
                lastGranulePos = oggHeader.granulePos;
        }
    }

    /*
    if (lastGranulePos >= firstGranulePos)
        lastGranulePos -= firstGranulePos;
    */

    printf("%f\n", ((double) lastGranulePos)/48000.0+2);

    return 0;
}
