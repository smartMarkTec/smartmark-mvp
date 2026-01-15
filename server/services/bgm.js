// server/services/bgm.js
/* eslint-disable */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

/**
 * Background music + narration mux helper
 * - Picks a local music track from Music/music/<industry>/
 * - Mixes it lightly under narration
 * - Forces final mp4 duration to narrationDuration + tailSeconds
 * - Pads video (clones last frame) if video is shorter than target
 */

const DEFAULT_MUSIC_ROOT = path.join(process.cwd(), "Music", "music");

function safeIndustrySlug(industry) {
  return String(industry || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function listAudioFiles(dir) {
  try {
    if (!fs.existsSync(dir)) return [];
    const exts = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg"]);
    return fs
      .readdirSync(dir)
      .map((f) => path.join(dir, f))
      .filter((p) => exts.has(path.extname(p).toLowerCase()) && fs.statSync(p).isFile());
  } catch {
    return [];
  }
}

function pickRandom(arr) {
  return arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : "";
}

function runBin(bin, args, { quiet = true } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit" });
    let out = "";
    let err = "";
    if (p.stdout) p.stdout.on("data", (d) => (out += d.toString()));
    if (p.stderr) p.stderr.on("data", (d) => (err += d.toString()));
    p.on("close", (code) => {
      if (code === 0) return resolve({ out, err });
      reject(new Error(`${bin} exited ${code}\n${err || out}`));
    });
  });
}

async function getDurationSec(mediaPath) {
  const ffprobe = process.env.FFPROBE_PATH || "ffprobe";
  const args = [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    mediaPath,
  ];
  const { out } = await runBin(ffprobe, args, { quiet: true });
  const s = parseFloat(String(out).trim());
  return Number.isFinite(s) ? s : 0;
}

/**
 * Finds a local music file based on industry.
 * Looks in:
 *  - Music/music/<industrySlug>/*
 *  - Music/music/<industryLower>/*
 *  - Music/music/default/*
 *  - Music/music/_default/*
 *  - Music/music/* (last resort)
 */
function resolveLocalBgmPath(industry, musicRoot = DEFAULT_MUSIC_ROOT) {
  const slug = safeIndustrySlug(industry);
  const rawLower = String(industry || "").trim().toLowerCase();

  const candidateDirs = [
    path.join(musicRoot, slug),
    path.join(musicRoot, rawLower),
    path.join(musicRoot, "default"),
    path.join(musicRoot, "_default"),
    musicRoot,
  ];

  for (const dir of candidateDirs) {
    const files = listAudioFiles(dir);
    const pick = pickRandom(files);
    if (pick) return pick;
  }
  return "";
}

/**
 * Mux visuals + narration + optional bgm.
 *
 * @param {object} opts
 * @param {string} opts.videoIn - mp4 with visuals (no need for audio)
 * @param {string} opts.voiceIn - narration audio (mp3/wav/etc)
 * @param {string} opts.industry - used to pick bgm from Music/music/<industry>/
 * @param {string} opts.outPath - output mp4 path
 * @param {number} [opts.tailSeconds=2.0] - extra seconds after narration ends (prevents long silence)
 * @param {number} [opts.bgmVolume=0.10] - background music volume (0.05–0.15 is typical)
 * @param {string} [opts.musicRoot] - override music root (defaults to Music/music)
 * @returns {Promise<{outPath:string,targetDur:number,bgmPath:string}>}
 */
async function muxWithVoiceAndBgm({
  videoIn,
  voiceIn,
  industry,
  outPath,
  tailSeconds = 2.0,
  bgmVolume = 0.10,
  musicRoot,
}) {
  if (!videoIn || !voiceIn || !outPath) {
    throw new Error("muxWithVoiceAndBgm missing required args: videoIn, voiceIn, outPath");
  }

  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";

  const voiceDur = await getDurationSec(voiceIn);
  const targetDur = Math.max(1, voiceDur + tailSeconds);

  const bgmPath = resolveLocalBgmPath(industry, musicRoot || DEFAULT_MUSIC_ROOT);

  const videoDur = await getDurationSec(videoIn);
  const padSeconds = Math.max(0, targetDur - videoDur);

  // Inputs:
  // 0: video
  // 1: narration
  // 2: bgm (optional, looped)
  const args = ["-y", "-i", videoIn, "-i", voiceIn];

  if (bgmPath) {
    args.push("-stream_loop", "-1", "-i", bgmPath);
  }

  const filterParts = [];

  // Video: trim to target, pad if needed by cloning last frame
  filterParts.push(
    `[0:v]trim=0:${targetDur.toFixed(3)},setpts=PTS-STARTPTS` +
      `,tpad=stop_mode=clone:stop_duration=${padSeconds.toFixed(3)}[v]`
  );

  // Narration: trim to target
  filterParts.push(
  `[1:a]atrim=0:${targetDur.toFixed(3)},asetpts=PTS-STARTPTS,volume=1.0[voice]`
);


  if (bgmPath) {
    // BGM: trim to target, low volume, small fades
    filterParts.push(
      `[2:a]atrim=0:${targetDur.toFixed(3)},asetpts=PTS-STARTPTS` +
        `,volume=${bgmVolume}` +
        `,afade=t=in:st=0:d=0.8` +
        `,afade=t=out:st=${Math.max(0, targetDur - 0.15).toFixed(3)}:d=0.15
[bgm]`
    );

    // Mix narration + bgm
   filterParts.push(`[voice][bgm]amix=inputs=2:duration=longest:dropout_transition=2[a]`);

  } else {
    // No bgm found => narration only
    filterParts.push(`[voice]anull[a]`);
  }

  args.push(
    "-filter_complex",
    filterParts.join(";"),
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-t",
    targetDur.toFixed(3),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    outPath
  );

  await runBin(ffmpeg, args, { quiet: true });
  return { outPath, targetDur, bgmPath };
}

module.exports = {
  muxWithVoiceAndBgm,
  resolveLocalBgmPath,
};
