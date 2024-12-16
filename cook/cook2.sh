#!/bin/sh
# Copyright (c) 2017-2024 Yahweasel
#
# Permission to use, copy, modify, and/or distribute this software for any
# purpose with or without fee is hereby granted, provided that the above
# copyright notice and this permission notice appear in all copies.
#
# THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
# WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
# MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
# SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
# WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
# OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
# CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

trap '' HUP
trap '' INT

timeout() {
    /usr/bin/timeout -k 5 "$@"
}

DEF_TIMEOUT=86400
ulimit -v $(( 8 * 1024 * 1024 ))
echo 10 > /proc/self/oom_adj

SCRIPTBASE="$(dirname "$0")"
SCRIPTBASE="$(realpath "$SCRIPTBASE")"

# Base for recordings
RECBASE="$(realpath "$SCRIPTBASE/../rec")"

# Base of output filename
FNAME=""

# ID to cook
ID=""

# Audio format to output
FORMAT=flac

# Caption format to output
CAPTIONFORMAT=vtt

# Container to output in
CONTAINER=zip

# What to include
INCLUDE_INFO=yes
INCLUDE_CHAT=yes
INCLUDE_AUDIO=yes
INCLUDE_CAPTIONS=maybe
INCLUDE_DURATIONS=no

# Only include specified track(s)
ONLY_TRACK=no
SUBTRACK=0

# Whether we have captions (as a separate question from whether to include
# them)
CHECK_CAPTIONS=no
HAVE_CAPTIONS=no

# Filters to apply to each track
FILTER="anull"

# We always use -1 for zip
ZIPFLAGS=-1

# Output files
FILES=

usage() {
    printf \
'Use: cook2.sh --id <ID> [--rec-base <rec dir base>] [--file-name <name>]
              [--format <format>] [--container <container>] [--filter <filter>]
              [--sample] [--exclude-all] [--include <audio/captions>]
              [--exclude <audio/captions>]
              [--only <track>] [--subtrack <id>]
' >&2
}

# Process arguments
while [ "$1" ]
do
    arg="$1"
    shift
    case "$arg" in
        --id|-i)
            ID="$1"
            shift
            ;;

        --rec-base)
            RECBASE="$(realpath "$1")"
            shift
            ;;

        --file-name)
            FNAME="$1"
            shift
            ;;

        --format|-f)
            FORMAT="$1"
            shift
            ;;

        --container|-c)
            CONTAINER="$1"
            shift
            ;;

        --filter|-f)
            FILTER="$FILTER,$1"
            shift
            ;;

        --sample)
            FILTER="$FILTER[aud]; amovie=$SCRIPTBASE/sample.flac,adelay=@DELAY@,aloop=loop=-1:size=2880000[samp]; [aud][samp]amix=2:duration=shortest"
            ;;

        --include)
            arg="$1"
            shift
            case "$arg" in
                info)
                    INCLUDE_INFO=yes
                    ;;

                chat)
                    INCLUDE_CHAT=yes
                    ;;

                audio)
                    INCLUDE_AUDIO=yes
                    ;;

                captions)
                    INCLUDE_CAPTIONS=yes
                    ;;

                durations)
                    INCLUDE_DURATIONS=yes
                    ;;
            esac
            ;;

        --exclude-all)
            INCLUDE_INFO=no
            INCLUDE_CHAT=no
            INCLUDE_AUDIO=no
            INCLUDE_CAPTIONS=no
            INCLUDE_DURATIONS=no
            ;;

        --exclude)
            arg="$1"
            shift
            case "$arg" in
                info)
                    INCLUDE_INFO=no
                    ;;

                chat)
                    INCLUDE_CHAT=no
                    ;;

                audio)
                    INCLUDE_AUDIO=no
                    ;;

                captions)
                    INCLUDE_CAPTIONS=no
                    ;;

                durations)
                    INCLUDE_DURATIONS=no
                    ;;
            esac
            ;;

        --only)
            ONLY_TRACK="$1"
            shift
            ;;

        --subtrack)
            SUBTRACK="$1"
            shift
            ;;

        *)
            usage
            exit 1
            ;;
    esac
done

# Check that an actual request was made
if [ ! "$ID" ]
then
    usage
    exit 1
fi

# Validation
case "$CONTAINER" in
    json)
        INCLUDE_AUDIO=no
        INCLUDE_DURATIONS=yes
        CAPTIONFORMAT=json
        if [ "$INCLUDE_CAPTIONS" = "maybe" ]
        then
            INCLUDE_CAPTIONS=no
            CHECK_CAPTIONS=yes
        fi
        ;;

    txt)
        INCLUDE_AUDIO=no
        INCLUDE_CAPTIONS=no
        ;;

    raw)
        INCLUDE_INFO=no
        INCLUDE_CHAT=no
        INCLUDE_CAPTIONS=no
        ;;

    aupzip)
        ;;

    *)
        CONTAINER=zip
        ;;
esac

# Figure out the encoding process
case "$FORMAT" in
    copy)
        ext=ogg
        ;;
    vorbis)
        ext=ogg
        ENCODE="oggenc -q 6 -"
        ;;
    aac)
        ext=aac
        #ENCODE="faac -q 100 -o /dev/stdout -"
        ENCODE="fdkaac -f 2 -m 4 -o - -"
        ;;
    opus)
        ext=opus
        ENCODE="opusenc --bitrate 96 - -"
        ;;
    wav)
        ext=wav
        ENCODE="ffmpeg -f wav -i - -f wav -c:a pcm_s16le -"
        ZIPFLAGS=-9
        ;;
    *)
        ext=flac
        ENCODE="flac - -c"
        ;;
esac
if [ "$CONTAINER" = "aupzip" ]
then
    # aupzip: Even though we use FLAC, Audacity throws a fit if they're not called .ogg
    ext=ogg
fi

cd "$RECBASE"

# Make a temporary directory for our results
tmpdir="$(mktemp -d)"
[ "$tmpdir" -a -d "$tmpdir" ]
echo 'rm -rf '"$tmpdir" | at 'now + 2 hours'

# We'll put our results into a subdirectory of it
OUTDIR="$tmpdir/out"
AUDDIR=""
mkdir "$OUTDIR" || exit 1

# For the aupzip container, our actual result goes into _data
if [ "$CONTAINER" = "aupzip" ]
then
    # Put actual audio in the _data dir
    AUDDIR="${FNAME}_data/"
    mkdir "$OUTDIR/$AUDDIR" || exit 1
fi

NICE="nice -n10 ionice -c3 chrt -i 0"

# Figure out the codecs in this file
CODECS="$(timeout 10 "$SCRIPTBASE/oggtracks" < $ID.ogg.header1)"

# And stream numbers
STREAM_NOS="$(timeout 10 "$SCRIPTBASE/oggtracks" -n < $ID.ogg.header1)"

# And number of streams
NB_STREAMS="$(echo "$CODECS" | wc -l)"

# Function to extract the metadata
mkmeta() {
    if [ ! -e $tmpdir/meta ]
    then
        timeout $DEF_TIMEOUT cat $ID.ogg.header1 $ID.ogg.header2 $ID.ogg.data |
            timeout $DEF_TIMEOUT "$SCRIPTBASE/oggmeta" > $tmpdir/meta
    fi
}

# Get the number of SFX tracks
if [ "$INCLUDE_AUDIO" = "yes" -o "$INCLUDE_DURATIONS" = "yes" ]
then
    mkmeta
    NB_SFX="$(timeout 10 "$SCRIPTBASE/sfx.js" -i "$ID.ogg.info" < $tmpdir/meta)"

    if [ "$INCLUDE_DURATIONS" = "yes" ]
    then
        # SFX *count* is included with metadata
        printf '"sfx":%d' "$NB_SFX" > "$OUTDIR/sfx.json"
        FILES="$FILES sfx.json"
    fi
fi

# Detect if we have captions
if [ "$INCLUDE_CAPTIONS" != "no" -o "$CHECK_CAPTIONS" = "yes" ]
then
    HAVE_CAPTIONS=no
    if [ -e $ID.ogg.captions -a -s $ID.ogg.captions ]
    then
        HAVE_CAPTIONS=yes
    else
        mkmeta
        grep -m 1 '"caption"' $tmpdir/meta > /dev/null 2>&1
        if [ "$?" = "0" ]
        then
            HAVE_CAPTIONS=yes
        fi
    fi
fi
if [ "$INCLUDE_CAPTIONS" = "maybe" ]
then
    INCLUDE_CAPTIONS="$HAVE_CAPTIONS"
fi
if [ "$INCLUDE_CAPTIONS" = "yes" ]
then
    if [ -e $ID.ogg.captions -a -s $ID.ogg.captions ]
    then
        CAPTION_FILE=$ID.ogg.captions
    else
        mkmeta
        CAPTION_FILE=$tmpdir/meta
    fi
fi

# Prepare the project file
if [ "$CONTAINER" = "aupzip" ]
then
    sed 's/@PROJNAME@/'"$FNAME"'_data/g' "$SCRIPTBASE/aup-header.xml" > "$tmpdir/out/$FNAME.aup"
    FILES="$FILES $FNAME.aup"
fi

# Make our fifos and surrounding content
for c in $(seq -w 1 $NB_STREAMS)
do
    if [ "$ONLY_TRACK" != "no" -a "$ONLY_TRACK" -ne "$c" ]
    then
        continue
    fi

    TRACK_USER="$($SCRIPTBASE/userinfo.js $ID $c)"
    [ "$TRACK_USER" ] || unset TRACK__USER
    TRACK_FN="$c${TRACK_USER+-}$TRACK_USER.$ext"
    CAP_FN="$c${TRACK_USER+-}$TRACK_USER.$CAPTIONFORMAT"
    TRACK_FFN="$OUTDIR/$AUDDIR$TRACK_FN"
    CAP_FFN="$OUTDIR/$CAP_FN"
    if [ "$INCLUDE_AUDIO" = "yes" ]
    then
        mkfifo "$TRACK_FFN"
        FILES="$FILES $AUDDIR$TRACK_FN"
    fi
    if [ "$INCLUDE_DURATIONS" = "yes" ]
    then
        mkfifo "$TRACK_FFN.duration"
        FILES="$FILES $AUDDIR$TRACK_FN.duration"
    fi
    if [ "$INCLUDE_CAPTIONS" = "yes" -a "$CONTAINER" != "json" ]
    then
        mkfifo "$CAP_FFN"
        FILES="$FILES $CAP_FN"
    fi

    # Make the XML line for Audacity
    if [ "$CONTAINER" = "aupzip" ]
    then
        printf '\t<import filename="%s" offset="0.00000000" mute="0" solo="0" height="150" minimized="0" gain="1.0" pan="0.0"/>\n' \
            "$TRACK_FN" >> "$OUTDIR/$FNAME.aup"
    fi
done

# Handle the SFX files
for c in $(seq -w 1 $NB_SFX)
do
    if [ "$ONLY_TRACK" != "no" -a "$ONLY_TRACK" != "sfx$c" -a "$ONLY_TRACK" != "sfx0$c" -a "$ONLY_TRACK" != "sfx00$c" ]
    then
        continue
    fi

    SFX_FN="sfx-$c.$ext"
    SFX_FFN="$OUTDIR/$AUDDIR$SFX_FN"

    if [ "$INCLUDE_AUDIO" = "yes" ]
    then
        mkfifo "$SFX_FFN"
        FILES="$FILES $AUDDIR$SFX_FN"

        if [ "$CONTAINER" = "aupzip" ]
        then
            printf '\t<import filename="%s" offset="0.00000000" mute="0" solo="0" height="150" minimized="0" gain="1.0" pan="0.0"/>\n' \
                "$SFX_FN" >> "$OUTDIR/$FNAME.aup"
        fi
    fi

    if [ "$INCLUDE_DURATIONS" = "yes" ]
    then
        mkfifo "$SFX_FFN.duration"
        FILES="$FILES $SFX_FFN.duration"
    fi
done

# End the XML file for Audacity
if [ "$CONTAINER" = "aupzip" ]
then
    printf '</project>\n' >> "$tmpdir/out/$FNAME.aup"
fi


# Encode thru fifos
for c in $(seq -w 1 $NB_STREAMS)
do
    if [ "$ONLY_TRACK" != "no" -a "$ONLY_TRACK" -ne "$c" ]
    then
        continue
    fi

    TRACK_USER="$($SCRIPTBASE/userinfo.js $ID $c)"
    [ "$TRACK_USER" ] || unset TRACK__USER
    TRACK_FN="$c${TRACK_USER+-}$TRACK_USER.$ext"
    CAP_FN="$c${TRACK_USER+-}$TRACK_USER.$CAPTIONFORMAT"
    TRACK_FFN="$OUTDIR/$AUDDIR$TRACK_FN"
    CAP_FFN="$OUTDIR/$CAP_FN"

    # Get the stream number of this track
    TRACK_STREAMNO="$(echo "$STREAM_NOS" | sed -n "$c"p)"

    if [ "$INCLUDE_AUDIO" = "yes" -o "$INCLUDE_DURATIONS" = "yes" ]
    then
        # Get the duration of this track
        TRACK_DURATION="$(timeout $DEF_TIMEOUT cat $ID.ogg.header1 $ID.ogg.header2 $ID.ogg.data |
            timeout $DEF_TIMEOUT $NICE "$SCRIPTBASE/oggduration" $c)"
    fi

    if [ "$INCLUDE_AUDIO" = "yes" ]
    then
        if [ "$FORMAT" = "copy" ]
        then
            # Just copy the data directly
            timeout $DEF_TIMEOUT cat \
                $ID.ogg.header1 $ID.ogg.header2 $ID.ogg.data \
                $ID.ogg.header1 $ID.ogg.header2 $ID.ogg.data |
                timeout $DEF_TIMEOUT $NICE "$SCRIPTBASE/oggcorrect" $TRACK_STREAMNO $SUBTRACK > "$TRACK_FFN" &

        else
            # Get out the codec for this track
            TRACK_CODEC="$(echo "$CODECS" | sed -n "$c"p)"
            [ "$TRACK_CODEC" = "opus" ] && TRACK_CODEC=libopus

            # Filter for this track (just the standard filter, but add a possible
            # delay for the sample download
            LFILTER="$(echo "$FILTER" | sed 's/@DELAY@/'"$(node -p '18500+Math.random()*2000')"'/g')"

            # Process the track
            timeout $DEF_TIMEOUT cat \
                $ID.ogg.header1 $ID.ogg.header2 $ID.ogg.data \
                $ID.ogg.header1 $ID.ogg.header2 $ID.ogg.data |
                timeout $DEF_TIMEOUT $NICE "$SCRIPTBASE/oggcorrect" $TRACK_STREAMNO $SUBTRACK |
                timeout $DEF_TIMEOUT $NICE ffmpeg -codec $TRACK_CODEC -copyts -i - \
                -filter_complex '[0:a]'"$LFILTER"'[aud]' \
                -map '[aud]' \
                -flags bitexact -f wav -c:a pcm_s24le - |
                timeout $DEF_TIMEOUT $NICE "$SCRIPTBASE/wavduration" "$TRACK_DURATION" |
                (
                    timeout $DEF_TIMEOUT $NICE $ENCODE > "$TRACK_FFN";
                    cat > /dev/null
                )

        fi
    fi

    # Duration metadata
    if [ "$INCLUDE_DURATIONS" = "yes" ]
    then
        printf '"duration_%s":%s' "$c" "$TRACK_DURATION" > "$TRACK_FFN.duration" &
    fi

    # And the captions
    if [ "$INCLUDE_CAPTIONS" = "yes" -a "$CONTAINER" != "json" ]
    then
        timeout $DEF_TIMEOUT $NICE "$SCRIPTBASE/vtt.js" -f $CAPTIONFORMAT $TRACK_STREAMNO < $CAPTION_FILE > "$CAP_FFN" &
    fi
done &

# Same for SFX
for c in $(seq -w 1 $NB_SFX)
do
    if [ "$ONLY_TRACK" != "no" -a "$ONLY_TRACK" != "sfx$c" -a "$ONLY_TRACK" != "sfx0$c" -a "$ONLY_TRACK" != "sfx00$c" ]
    then
        continue
    fi

    SFX_FN="sfx-$c.$ext"
    SFX_FFN="$OUTDIR/$AUDDIR$SFX_FN"
    SFX_DURATION="$(timeout $DEF_TIMEOUT "$SCRIPTBASE/sfx.js" -i "$ID.ogg.info" -d $((c-1)) < $tmpdir/meta)"

    if [ "$INCLUDE_AUDIO" = "yes" ]
    then
        LFILTER="$(timeout $DEF_TIMEOUT "$SCRIPTBASE/sfx.js" -i "$ID.ogg.info" $((c-1)) < $tmpdir/meta)"
        timeout $DEF_TIMEOUT $NICE ffmpeg -filter_complex "$LFILTER" -map '[aud]' -flags bitexact -f wav - |
            timeout $DEF_TIMEOUT $NICE "$SCRIPTBASE/wavduration" "$SFX_DURATION" |
            (
                timeout $DEF_TIMEOUT $NICE $ENCODE > "$SFX_FFN";
                cat > /dev/null
            )
    fi

    if [ "$INCLUDE_DURATIONS" = "yes" ]
    then
        printf '"sfx_duration_%s":%s' "$c" "$SFX_DURATION" > "$SFX_FFN.duration" &
    fi
done &

#if [ "$FORMAT" = "copy" ]
#then
#    # Wait for the immediate child, which has spawned more children
#    wait
#fi


# Also provide info.txt
if [ "$INCLUDE_INFO" = "yes" ]
then
    if [ "$CONTAINER" != "json" ]
    then
        mkfifo $OUTDIR/info.txt
        FILES="$FILES info.txt"
        if [ "$INCLUDE_CHAT" = "yes" ]
        then
            mkmeta
            timeout $DEF_TIMEOUT "$SCRIPTBASE/info2.js" "$ID" < $tmpdir/meta > $OUTDIR/info.txt &
        else
            timeout $DEF_TIMEOUT "$SCRIPTBASE/info2.js" "$ID" < /dev/null > $OUTDIR/info.txt &
        fi
    else #json
        mkmeta
        mkfifo $OUTDIR/info.json
        FILES="$FILES info.json"
        if [ "$INCLUDE_CHAT" = "yes" ]
        then
            timeout $DEF_TIMEOUT "$SCRIPTBASE/info2.js" --json "$ID" < $tmpdir/meta > $OUTDIR/info.json &
        else
            timeout $DEF_TIMEOUT "$SCRIPTBASE/info2.js" --json "$ID" < /dev/null > $OUTDIR/info.json &
        fi
        mkfifo $OUTDIR/meta.json
        FILES="$FILES meta.json"
        (
            printf '"meta":['
            grep -v '"c":"caption"' $tmpdir/meta | sed 's/$/,/'
            printf 'null]'
        ) > $OUTDIR/meta.json &
    fi
fi
       
# And full captions
if [ "$INCLUDE_CAPTIONS" = "yes" ]
then
    if [ "$CONTAINER" = "json" ]
    then
        mkfifo $OUTDIR/captions.json
        FILES="$FILES captions.json"
        timeout $DEF_TIMEOUT "$SCRIPTBASE/vtt.js" -f json -u $ID.ogg.users < $CAPTION_FILE > $OUTDIR/captions.json &
    else
        mkfifo $OUTDIR/captions.vtt
        FILES="$FILES captions.vtt"
        timeout $DEF_TIMEOUT "$SCRIPTBASE/vtt.js" -f vtt -u $ID.ogg.users < $CAPTION_FILE > $OUTDIR/captions.vtt &
        mkfifo $OUTDIR/transcript.txt
        FILES="$FILES transcript.txt"
        timeout $DEF_TIMEOUT "$SCRIPTBASE/vtt.js" -f txt -u $ID.ogg.users < $CAPTION_FILE > $OUTDIR/transcript.txt &
    fi
fi


# Put them into their container
cd "$OUTDIR"
case "$CONTAINER" in
    json)
        printf '{\n'
        for i in $FILES
        do
            cat $i
            printf ',\n'
        done
        printf '"transcript":'
        if [ "$HAVE_CAPTIONS" = "yes" ]
        then
            printf 'true\n'
        else
            printf 'false\n'
        fi
        printf '}\n'
        ;;

    txt|raw)
        cat $FILES
        ;;

    *)
        timeout $DEF_TIMEOUT $NICE zip $ZIPFLAGS -FI - $FILES
        ;;
esac | (cat || cat > /dev/null)

# And clean up after ourselves
cd
rm -rf "$tmpdir/"

wait
