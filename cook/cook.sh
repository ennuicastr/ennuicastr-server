#!/bin/sh
# Copyright (c) 2017-2022 Yahweasel
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

DEF_TIMEOUT=7200
ulimit -v $(( 8 * 1024 * 1024 ))
echo 10 > /proc/self/oom_adj

SCRIPTBASE=`dirname "$0"`
SCRIPTBASE=`realpath "$SCRIPTBASE"`

# Use cook.sh <base directory> <filename> <ID> <format> <container> [dynaudnorm]

[ "$1" ]
RECBASE="$1"
shift

[ "$1" ]
FNAME="$1"
shift

[ "$1" ]
ID="$1"
shift

FORMAT=flac
if [ "$1" ]
then
    FORMAT="$1"
    shift
fi

CONTAINER=zip
if [ "$1" ]
then
    CONTAINER="$1"
    shift
fi

FILTER="anull"

for arg in "$@"
do
    case "$arg" in
        dynaudnorm)
            FILTER="$FILTER,dynaudnorm"
            ;;

        sample)
            FILTER="$FILTER[aud]; amovie=$SCRIPTBASE/sample.flac,adelay=@DELAY@,aloop=loop=-1:size=2880000[samp]; [aud][samp]amix=2:duration=shortest"
            ;;

        *)
            printf 'Unrecognized argument "%s"\n' "$arg" >&2
            exit 1
            ;;
    esac
done

ZIPFLAGS=-1
EXTRAFILES=

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
    *)
        ext=flac
        ENCODE="flac - -c"
        ;;
esac
if [ "$CONTAINER" = "mix" -o "$CONTAINER" = "aupzip" ]
then
    # mix: Smart auto-mixing, so ext is temporary
    # aupzip: Even though we use FLAC, Audacity throws a fit if they're not called .ogg
    ext=ogg
fi

cd "$RECBASE"

tmpdir=`mktemp -d`
[ "$tmpdir" -a -d "$tmpdir" ]

echo 'rm -rf '"$tmpdir" | at 'now + 2 hours'

OUTDIR="$tmpdir/out"
mkdir "$OUTDIR" || exit 1
if [ "$CONTAINER" = "aupzip" ]
then
    # Put actual audio in the _data dir
    OUTDIR="$OUTDIR/${FNAME}_data"
    mkdir "$OUTDIR" || exit 1
fi

# Take a lock on the data file so that we can detect active downloads
#exec 9< "$ID.ogg.data"
#flock -n 9 || exit 1

NICE="nice -n10 ionice -c3 chrt -i 0"
CODECS=`timeout 10 "$SCRIPTBASE/oggtracks" < $ID.ogg.header1`
STREAM_NOS=`timeout 10 "$SCRIPTBASE/oggtracks" -n < $ID.ogg.header1`
NB_STREAMS=`echo "$CODECS" | wc -l`

timeout $DEF_TIMEOUT cat $ID.ogg.header1 $ID.ogg.header2 $ID.ogg.data |
    timeout $DEF_TIMEOUT "$SCRIPTBASE/oggmeta" > $tmpdir/meta
NB_SFX=`timeout 10 "$SCRIPTBASE/sfx.js" -i "$ID.ogg.info" < $tmpdir/meta`

# Detect if we have captions
CAPTIONS=no
grep -m 1 '"caption"' $tmpdir/meta > /dev/null 2>&1
if [ "$?" = "0" ]
then
    CAPTIONS=yes

    CAPTION_FILE=$tmpdir/meta
    if [ -e $ID.ogg.captions ]
    then
        CAPTION_FILE=$ID.ogg.captions
    fi
fi

# Prepare the project file
if [ "$CONTAINER" = "aupzip" ]
then
    (
        sed 's/@PROJNAME@/'"$FNAME"'_data/g' "$SCRIPTBASE/aup-header.xml";
#        timeout $DEF_TIMEOUT cat $ID.ogg.header1 $ID.ogg.header2 $ID.ogg.data |
#            timeout $DEF_TIMEOUT "$SCRIPTBASE/cook/extnotes" -f audacity
    ) > "$tmpdir/out/$FNAME.aup"
fi

# Make our fifos and surrounding content
for c in `seq -w 1 $NB_STREAMS`
do
    O_USER="`$SCRIPTBASE/userinfo.js $ID $c`"
    [ "$O_USER" ] || unset O_USER
    O_FN="$c${O_USER+-}$O_USER.$ext"
    C_FN="$c${O_USER+-}$O_USER.vtt"
    O_FFN="$OUTDIR/$O_FN"
    C_FFN="$OUTDIR/$C_FN"
    mkfifo "$O_FFN"
    if [ "$CAPTIONS" = "yes" ]
    then
        mkfifo "$C_FFN"
    fi

    # Make the XML line
    if [ "$CONTAINER" = "aupzip" ]
    then
        printf '\t<import filename="%s" offset="0.00000000" mute="0" solo="0" height="150" minimized="0" gain="1.0" pan="0.0"/>\n' \
            "$O_FN" >> "$tmpdir/out/$FNAME.aup"
    fi
done

# Plus SFX (FIXME: duplication)
for c in `seq -w 1 $NB_SFX`
do
    O_FN="sfx-$c.$ext"
    O_FFN="$OUTDIR/$O_FN"
    mkfifo "$O_FFN"

    if [ "$CONTAINER" = "aupzip" ]
    then
        printf '\t<import filename="%s" offset="0.00000000" mute="0" solo="0" height="150" minimized="0" gain="1.0" pan="0.0"/>\n' \
            "$O_FN" >> "$tmpdir/out/$FNAME.aup"
    fi
done

if [ "$CONTAINER" = "aupzip" ]
then
    printf '</project>\n' >> "$tmpdir/out/$FNAME.aup"
fi


# Encode thru fifos
for c in `seq -w 1 $NB_STREAMS`
do
    O_USER="`$SCRIPTBASE/userinfo.js $ID $c`"
    [ "$O_USER" ] || unset O_USER
    O_FN="$c${O_USER+-}$O_USER.$ext"
    C_FN="$c${O_USER+-}$O_USER.vtt"
    O_FFN="$OUTDIR/$O_FN"
    C_FFN="$OUTDIR/$C_FN"
    T_DURATION=`timeout $DEF_TIMEOUT cat $ID.ogg.header1 $ID.ogg.header2 $ID.ogg.data |
        timeout $DEF_TIMEOUT $NICE "$SCRIPTBASE/oggduration" $c`
    sno=`echo "$STREAM_NOS" | sed -n "$c"p`

    if [ "$FORMAT" = "copy" -o "$CONTAINER" = "mix" ]
    then
        timeout $DEF_TIMEOUT cat \
            $ID.ogg.header1 $ID.ogg.header2 $ID.ogg.data \
            $ID.ogg.header1 $ID.ogg.header2 $ID.ogg.data |
            timeout $DEF_TIMEOUT $NICE "$SCRIPTBASE/oggcorrect" $sno > "$O_FFN" &

    else
        CODEC=`echo "$CODECS" | sed -n "$c"p`
        [ "$CODEC" = "opus" ] && CODEC=libopus

        LFILTER="$(echo "$FILTER" | sed 's/@DELAY@/'"$(node -p '18500+Math.random()*2000')"'/g')"

        timeout $DEF_TIMEOUT cat \
            $ID.ogg.header1 $ID.ogg.header2 $ID.ogg.data \
            $ID.ogg.header1 $ID.ogg.header2 $ID.ogg.data |
            timeout $DEF_TIMEOUT $NICE "$SCRIPTBASE/oggcorrect" $sno |
            timeout $DEF_TIMEOUT $NICE ffmpeg -codec $CODEC -copyts -i - \
            -filter_complex '[0:a]'"$LFILTER"'[aud]' \
            -map '[aud]' \
            -flags bitexact -f wav - |
            timeout $DEF_TIMEOUT $NICE "$SCRIPTBASE/wavduration" "$T_DURATION" |
            (
                timeout $DEF_TIMEOUT $NICE $ENCODE > "$O_FFN";
                cat > /dev/null
            )

    fi

    if [ "$CAPTIONS" = "yes" ]
    then
        timeout $DEF_TIMEOUT $NICE "$SCRIPTBASE/vtt.js" $sno < $CAPTION_FILE > "$C_FFN" &
    fi
done &
for c in `seq -w 1 $NB_SFX`
do
    O_FN="sfx-$c.$ext"
    O_FFN="$OUTDIR/$O_FN"
    T_DURATION="$(timeout $DEF_TIMEOUT "$SCRIPTBASE/sfx.js" -i "$ID.ogg.info" -d $((c-1)) < $tmpdir/meta)"
    LFILTER="$(timeout $DEF_TIMEOUT "$SCRIPTBASE/sfx.js" -i "$ID.ogg.info" $((c-1)) < $tmpdir/meta)"
    timeout $DEF_TIMEOUT $NICE ffmpeg -filter_complex "$LFILTER" -map '[aud]' -flags bitexact -f wav - |
        timeout $DEF_TIMEOUT $NICE "$SCRIPTBASE/wavduration" "$T_DURATION" |
        (
            timeout $DEF_TIMEOUT $NICE $ENCODE > "$O_FFN";
            cat > /dev/null
        )
done &
if [ "$FORMAT" = "copy" -o "$CONTAINER" = "mix" ]
then
    # Wait for the immediate child, which has spawned more children
    wait
fi


# Also provide info.txt
if [ "$CONTAINER" = "zip" -o "$CONTAINER" = "aupzip" -o "$CONTAINER" = "exe" ]
then
    mkfifo $OUTDIR/info.txt
    timeout $DEF_TIMEOUT "$SCRIPTBASE/info.js" "$ID" < $tmpdir/meta > $OUTDIR/info.txt &

    if [ "$CAPTIONS" = "yes" ]
    then
        mkfifo $OUTDIR/captions.vtt
        timeout $DEF_TIMEOUT "$SCRIPTBASE/vtt.js" -u $ID.ogg.users < $CAPTION_FILE > $OUTDIR/captions.vtt &
        mkfifo $tmpdir/out/transcript.txt
        timeout $DEF_TIMEOUT "$SCRIPTBASE/vtt.js" -u $ID.ogg.users -t < $CAPTION_FILE > $tmpdir/out/transcript.txt &
        EXTRAFILES="$EXTRAFILES transcript.txt"
    fi
fi


# Put them into their container
cd "$tmpdir/out"
case "$CONTAINER" in
    ogg|matroska)
        if [ "$FORMAT" = "copy" -a "$CONTAINER" = "ogg" ]
        then
            "$SCRIPTBASE/oggmultiplexer" *.ogg
        else
            INPUT=""
            MAP=""
            c=0
            for i in *.$ext
            do
                [ "$FORMAT" != "copy" ] || INPUT="$INPUT -copyts"
                INPUT="$INPUT -i $i"
                MAP="$MAP -map $c"
                c=$((c+1))
            done
            timeout $DEF_TIMEOUT $NICE ffmpeg $INPUT $MAP -c:a copy -f $CONTAINER - < /dev/null
        fi
        ;;

    mix)
        INPUT=""
        FILTER=""
        MIXFILTER=""
        ci=0
        co=0
        for i in *.$ext
        do
            CODEC=`echo "$CODECS" | sed -n "$((ci+1))"p`
            [ "$CODEC" = "opus" ] && CODEC=libopus

            INPUT="$INPUT -codec $CODEC -copyts -i $i"
            FILTER="$FILTER[$ci:a]$ARESAMPLE,dynaudnorm[aud$co];"
            MIXFILTER="$MIXFILTER[aud$co]"
            ci=$((ci+1))
            co=$((co+1))

            # amix can only mix 32 at a time, so if we reached that, we have to start again
            if [ "$co" = "32" ]
            then
                MIXFILTER="$MIXFILTER amix=32,dynaudnorm[aud0];[aud0]"
                co=1
            fi
        done
        MIXFILTER="$MIXFILTER amix=$co,dynaudnorm[aud]"
        FILTER="$FILTER$MIXFILTER"
        DURATION=`timeout $DEF_TIMEOUT $NICE "$SCRIPTBASE/cook/oggduration" < "$SCRIPTBASE/rec/$ID.ogg.data"`
        timeout $DEF_TIMEOUT $NICE ffmpeg $INPUT -filter_complex "$FILTER" -map '[aud]' -flags bitexact -f wav - < /dev/null |
            timeout $DEF_TIMEOUT $NICE "$SCRIPTBASE/cook/wavduration" "$DURATION" |
            (
                timeout $DEF_TIMEOUT $NICE $ENCODE;
                cat > /dev/null
            )
        ;;

    aupzip)
        timeout $DEF_TIMEOUT $NICE zip $ZIPFLAGS -r -FI - "$FNAME.aup" \
            "${FNAME}_data"/*.$ext "${FNAME}_data"/*.vtt $EXTRAFILES "${FNAME}_data"/info.txt
        ;;

    *)
        timeout $DEF_TIMEOUT $NICE zip $ZIPFLAGS -FI - *.$ext *.vtt $EXTRAFILES info.txt
        ;;
esac | (cat || cat > /dev/null)

# And clean up after ourselves
cd
rm -rf "$tmpdir/"

wait
