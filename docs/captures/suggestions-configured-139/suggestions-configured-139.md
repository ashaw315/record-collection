# /suggestions with Ask Claude offered

The test database; desktop Chromium, touch on for the coarse pointer. The server was started with a placeholder for the model key, `not-a-key-capture-only`, which is not a credential, so that the panel is the one a reader sees; every answer in these pictures is a stub’s.

| state | window | pointer | page height | picture, or why there is none |
|---|---|---|---|---|
| nothing to suggest; Ask Claude before it is asked | 390 | coarse | 844 | suggestions-nothing-to-suggest-w390-coarse-pointer.png |
| the list, three artists; Ask Claude before it is asked | 390 | coarse | 959 | suggestions-list-ask-idle-w390-coarse-pointer.png |
| Ask Claude, thinking (the answer held) | 390 | coarse | 959 | suggestions-ask-thinking-w390-coarse-pointer.png |
| Ask Claude, failed: the service at its limit | 390 | coarse | 990 | suggestions-ask-failed-w390-coarse-pointer.png |
| Ask Claude, answered with three records | 390 | coarse | 1359 | suggestions-ask-answered-w390-coarse-pointer.png |
| nothing to suggest; Ask Claude before it is asked | 1280 | fine | 844 | suggestions-nothing-to-suggest-w1280-fine-pointer.png |
| the list, three artists; Ask Claude before it is asked | 1280 | fine | 844 | suggestions-list-ask-idle-w1280-fine-pointer.png |
| Ask Claude, thinking (the answer held) | 1280 | fine | 844 | suggestions-ask-thinking-w1280-fine-pointer.png |
| Ask Claude, failed: the service at its limit | 1280 | fine | 844 | suggestions-ask-failed-w1280-fine-pointer.png |
| Ask Claude, answered with three records | 1280 | fine | 1026 | suggestions-ask-answered-w1280-fine-pointer.png |

## No request to the model was made

**What this rests on:** `/suggestions` reaches the model by one path, `POST /api/suggestions/ai`, which only the browser starts, when Ask Claude is pressed. The page’s own render and the route’s GET read the database and the environment and call no model (read from the code, 12 Oct). So the server calls the model only if a POST reaches it, and none did:

- The page made **6** request(s) to `/api/suggestions/ai` (POST at 390, POST at 390, POST at 390, POST at 1280, POST at 1280, POST at 1280); the stub answered **6** in the browser. Equal: none reached the server.
- The key was `not-a-key-capture-only`: a placeholder, not a credential.

**Not what it rests on:** the server’s own guard (`assertNoLiveCall`) and a listener at `http://127.0.0.1:39139` given to it as the model’s address stood behind the stub. The listener counted the one request sent to prove it counts and then received 0. That nought shows nothing by itself: no request reached the server, so it would be nought whatever address the server held, and that the server held this one was not read back.

Every state above was reached.
