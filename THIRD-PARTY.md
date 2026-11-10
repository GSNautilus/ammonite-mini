# Third-party code

Ammonite Mini's own code is MIT (see [LICENSE](LICENSE)). It has no vendored or
submodule code: the libraries below come from Maven when the Android app is built,
and keep their own license.

| Project | License | What for |
|---|---|---|
| [Oboe](https://github.com/google/oboe) (Google) | Apache-2.0 | the audio output (AAudio) |
| [AndroidX WebKit](https://developer.android.com/jetpack/androidx/releases/webkit), with the AndroidX libraries it depends on | Apache-2.0 | the WebView page |
| [Kotlin standard library](https://github.com/JetBrains/kotlin), via AndroidX | Apache-2.0 | |
| libc++ from the Android NDK ([LLVM](https://llvm.org/LICENSE.txt)) | Apache-2.0 with LLVM Exceptions | the C++ standard library, `libc++_shared.so` |

The APK carries these notices, with the full Apache-2.0 text, as
[`android/app/src/main/assets/THIRD-PARTY.txt`](android/app/src/main/assets/THIRD-PARTY.txt)
(from 0.2.0 on; for 0.1.0 the same file is attached to the release).

The engine and the page are Ammonite's own code, copied from
[`ammonite`](https://github.com/GSNautilus/ammonite) (MIT).
