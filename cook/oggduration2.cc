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

#include <set>
#include <iostream>
#include <unordered_map>

#include <fcntl.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <string.h>
#include <unistd.h>

using namespace std;

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

ssize_t readAll(int fd, void *vbuf, size_t count) {
    unsigned char *buf = (unsigned char *) vbuf;
    ssize_t rd = 0, ret;
    while (rd < count) {
        ret = read(fd, buf + rd, count - rd);
        if (ret <= 0) return ret;
        rd += ret;
    }
    return rd;
}

uint32_t getPacketSize(int fd) {
    unsigned char segmentCount, segmentVal;
    uint32_t packetSize = 0;
    if (readAll(fd, &segmentCount, 1) != 1)
        return 0;
    for (; segmentCount; segmentCount--) {
        if (readAll(fd, &segmentVal, 1) != 1)
            return 0;
        packetSize += (uint32_t) segmentVal;
    }
    return packetSize;
}

uint32_t skipData(int fd) {
    uint32_t packetSize = getPacketSize(fd);
    lseek(fd, packetSize, SEEK_CUR);
    return packetSize;
}

void reportDuration(
    uint32_t track, uint64_t firstGranulePos, uint64_t lastGranulePos
) {
    if (lastGranulePos > firstGranulePos)
        lastGranulePos -= firstGranulePos;
    double duration = lastGranulePos / 48000.0 + 2;
    cout << track << ": " << duration << endl;
}

int main(int argc, char **argv) {
    int fd;
    ssize_t rd;
    struct OggPreHeader preHeader;
    struct stat sbuf;

    // 1: Find every track
    int foundMeta = 0;
    uint32_t metaStreamNo = 0;
    set<uint32_t> tracks;
    fd = open(argv[1], O_RDONLY);
    if (fd < 0) {
        perror(argv[1]);
        return 1;
    }
    while (readAll(fd, &preHeader, sizeof(preHeader)) == sizeof(preHeader)) {
        struct OggHeader oggHeader;
        if (memcmp(preHeader.capturePattern, "OggS", 4))
            break;
        if (readAll(fd, &oggHeader, sizeof(oggHeader)) != sizeof(oggHeader))
            break;

        uint32_t packetSize = getPacketSize(fd);
        if (packetSize == 0)
            continue;
        if (packetSize < 4096) {
            unsigned char buf[packetSize];
            if (readAll(fd, buf, packetSize) != packetSize)
                break;

            // Look for a meta track
            if (!foundMeta) {
                if (packetSize >= 8 && !memcmp(buf, "ECMETA", 6)) {
                    foundMeta = 1;
                    metaStreamNo = oggHeader.streamNo;
                }
            }
        } else {
            lseek(fd, packetSize, SEEK_CUR);
        }

        if (!foundMeta || oggHeader.streamNo != metaStreamNo)
            tracks.insert(oggHeader.streamNo);
    }
    close(fd);

    // 2: Open the data
    fd = open(argv[3], O_RDONLY);
    if (fd < 0) {
        perror(argv[3]);
        return 1;
    }
    if (fstat(fd, &sbuf) != 0) {
        perror(argv[3]);
        return 1;
    }

    // 3: Get the starting time
    uint64_t startTime = 0;
    while (readAll(fd, &preHeader, sizeof(preHeader)) == sizeof(preHeader)) {
        struct OggHeader oggHeader;
        if (memcmp(preHeader.capturePattern, "OggS", 4))
            break;
        if (readAll(fd, &oggHeader, sizeof(oggHeader)) != sizeof(oggHeader))
            break;
        if (skipData(fd) == 0)
            continue;
        if (oggHeader.granulePos) {
            startTime = oggHeader.granulePos;
            break;
        }
    }

    // 4: Search for the end of every track
    unordered_map<uint32_t, uint64_t> trackDurations;
    set<uint32_t> resolvedTracks;

    if (lseek(fd, 0, SEEK_SET) == (off_t) -1) {
        perror(argv[3]);
        return 1;
    }

    // Look for track ending durations
    while (readAll(fd, &preHeader, sizeof(preHeader)) == sizeof(preHeader)) {
        struct OggHeader oggHeader;
        if (memcmp(preHeader.capturePattern, "OggS", 4))
            break;
        if (readAll(fd, &oggHeader, sizeof(oggHeader)) != sizeof(oggHeader))
            break;
        if (skipData(fd) == 0)
            continue;
        if (!tracks.contains(oggHeader.streamNo))
            continue;
        trackDurations[oggHeader.streamNo] = oggHeader.granulePos;
    }
    close(fd);

    // 5: Figure out the overall duration
    uint64_t lastGranulePos = 0;
    for (auto &duration : trackDurations) {
        if (duration.second > lastGranulePos)
            lastGranulePos = duration.second;
    }

    // 6: Report
    reportDuration(0, startTime, lastGranulePos);
    for (auto track : tracks) {
        uint64_t duration = 0;
        const auto &durationIt = trackDurations.find(track);
        if (durationIt != trackDurations.end())
            duration = durationIt->second;
        reportDuration(track, startTime, duration);
    }
}
