# YouTube Tool

Extract transcripts, metadata, and audio from YouTube videos using `yt-dlp`.

## Quick Reference

### Get transcript (preferred — fastest)
```bash
yt-dlp --write-auto-subs --sub-langs "en.*" --skip-download --print-to-file "%(requested_subtitles.en.filepath)s" - -o "%(id)s" "URL"
# Or simpler — dump subtitle text directly:
yt-dlp --write-auto-subs --sub-langs "en.*" --skip-download -o "/tmp/%(id)s" "URL" && cat /tmp/*.vtt | sed '/^$/d; /^[0-9]/d; /-->/d; /WEBVTT/d; /Kind:/d; /Language:/d' | awk '!seen[$0]++'
```

### Get video metadata
```bash
yt-dlp --print "%(title)s\n%(duration_string)s\n%(description)s\n%(channel)s\n%(upload_date)s" "URL"
```

### Get chapters
```bash
yt-dlp --print "%(chapters)j" "URL"
```

### Download audio only (for transcription when no subs available)
```bash
yt-dlp -x --audio-format mp3 --audio-quality 5 -o "/tmp/%(id)s.%(ext)s" "URL"
```

### List available subtitles
```bash
yt-dlp --list-subs "URL"
```

## Common Patterns

### Full video summary workflow
1. Get metadata: `yt-dlp --print "%(title)s|%(duration_string)s|%(channel)s" "URL"`
2. Get transcript: download auto-subs as above
3. Read and summarize the transcript text

### Playlist extraction
```bash
yt-dlp --flat-playlist --print "%(id)s %(title)s" "PLAYLIST_URL"
```

### Search YouTube
```bash
yt-dlp "ytsearch5:search query" --flat-playlist --print "%(id)s %(title)s %(duration_string)s"
```

## Notes
- Transcripts work from cloud IPs; video downloads may be rate-limited
- Auto-generated subs are available for most English videos
- For videos without any subs, download audio and use Whisper for transcription
- Use `--cookies-from-browser` if you hit auth issues (unlikely for public videos)
