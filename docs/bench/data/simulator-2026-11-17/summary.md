Tokens: characters / 4 (no ANTHROPIC_API_KEY was set). Images: width * height / 750 after scaling to at most 2576 px on the long edge and about 4784 tokens.

| Tool | Mac | Sign-in flow (median) | Flow tokens | Flow ok | Read median | Read p90 | Read tokens | Tap median | Tap p90 | Tap reports change | Type median | Tool list tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| phonedriver phonedriver 0.1.5 |  | 1.75 s | 173 | 10/10 | 29 ms | 29 ms | 59 | 316 ms | 330 ms | 20/20 | 848 ms | 1,849 |
| simulator-use 0.17.0 |  | 1.78 s | 192 | 10/10 | 45 ms | 52 ms | 71 | 435 ms | 453 ms | 20/20 | 578 ms | 2,443 |
| Argent 0.33.0 |  | 5.33 s | 7,000 | 10/10 | 185 ms | 191 ms | 622 | 656 ms | 662 ms | 20/20 | 2.71 s | 36,826 |
| agent-device 0.21.39 |  | 5.67 s | 762 | 10/10 | 33 ms | 41 ms | 125 | 872 ms | 879 ms | 20/20 | 2.43 s | 27,918 |

Batched flow (where the tool has a batch or sequence call):

| Tool | Batched flow (median) | Tokens | ok |
|---|---|---|---|
| phonedriver (Mac null) | 1.78 s | 177 | 10/10 |
| simulator-use (Mac null) | 1.35 s | 177 | 10/10 |
| Argent (Mac null) | 4.03 s | 2,902 | 10/10 |
| agent-device (Mac null) | 4.78 s | 546 | 10/10 |

Failures:

