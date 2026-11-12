# JOONS MCP Mock Server

![Preview](https://img.shields.io/badge/status-Preview-orange) ![License](https://img.shields.io/badge/license-Apache--2.0-blue) ![Node](https://img.shields.io/badge/node-%3E%3D20-green) [![CI](https://github.com/dbdefault/joons-mcp-mock-server/actions/workflows/ci.yml/badge.svg)](https://github.com/dbdefault/joons-mcp-mock-server/actions/workflows/ci.yml)

도구 스냅샷으로 실제와 유사한 모의 MCP 서버를 만들어 에이전트를 안전하게 개발하고 테스트합니다. 이 독립적인 오픈소스 제품은 스냅샷과 선택적인 픽스처를 읽어 표준 입출력으로 도구를 제공합니다.

## 안전이 우선입니다

이 서버는 모의 서버입니다. 응답은 픽스처에서 나오며 실제 작업은 수행하지 않습니다. 네트워크 요청, 실제 서버로의 전달, 자식 프로세스 실행을 하지 않으며 스냅샷이나 픽스처의 내용을 실행하거나 평가하지도 않습니다. 선택한 입력 파일은 읽지만 파일 쓰기는 사용자가 지정한 선택적 보고서에만 사용합니다. 명령이나 경로, 주소처럼 보이는 내용도 데이터로 취급합니다.

## 사용하는 이유

실제 서비스에 영향을 주지 않고 반복 가능한 도구 목록과 성공, 실패, 지연 상황을 이용해 에이전트를 시험할 수 있습니다. [JOONS MCP Diff](https://github.com/dbdefault/joons-mcp-diff)는 스냅샷을 만들고, [JOONS MCP Probe](https://github.com/dbdefault/joons-mcp-probe)는 실제 서버를 진단하며, [JOONS MCP Policy Gate](https://github.com/dbdefault/joons-mcp-policy-gate)는 스냅샷을 정책에 따라 검사합니다. 이 제품들은 각각 독립적으로 실행되며 모의 서버 실행에 필요하지 않습니다. 이 프로젝트는 [JOONS 생태계](https://github.com/dbdefault/joons-ecosystem)의 일부입니다.

## 빠른 시작

Node.js 20 이상이 필요합니다. 미리보기 버전 0.1.0은 npm에 게시되지 않았으므로 태그에서 설치합니다.

```sh
npm install -g github:dbdefault/joons-mcp-mock-server#v0.1.0
```

JOONS MCP Diff로 스키마 버전 1 스냅샷을 만들거나 제공된 예제를 사용하세요. [픽스처 예제](examples/fixtures.json)를 참고하여 응답을 작성한 다음 입력을 검증하고 서버를 시작합니다.

```sh
joons-mcp-mock-server validate --snapshot examples/snapshot.json
joons-mcp-mock-server validate-fixtures --fixtures examples/fixtures.json --snapshot examples/snapshot.json
joons-mcp-mock-server start --snapshot examples/snapshot.json --fixtures examples/fixtures.json
```

MCP 클라이언트 설정에는 다음과 같이 표준 입출력 서버를 등록할 수 있습니다. 경로는 해당 클라이언트에서 접근할 수 있는 위치로 지정하세요.

```json
{ "mcpServers": { "shop-mock": { "command": "joons-mcp-mock-server", "args": ["start", "--snapshot", "examples/snapshot.json", "--fixtures", "examples/fixtures.json"] } } }
```

## 픽스처 형식

최상위 `format`은 `joons-mcp-mock-server/fixtures`, `fixtureVersion`은 1입니다. 각 도구에는 기본 응답 `default`, 순서가 있는 인자별 응답 `match`, 선언된 시나리오별 응답을 지정할 수 있습니다. 결과 응답에는 `content`가 필수이며 `structuredContent`, `isError`, `delayMs`를 선택적으로 넣습니다. 결과 대신 `protocolError`를 지정할 수도 있습니다. 일치 항목에 나열된 최상위 인자가 호출에 모두 존재하고 값이 깊은 비교로 같으면 해당 항목이 선택됩니다. 일치하는 첫 항목이 우선합니다.

응답이 없으면 기본적으로 오류 결과를 반환하며 `missingFixture`를 `empty`로 설정하면 빈 콘텐츠를 반환합니다. 구조에 허용되지 않은 키는 오류입니다. 응답 블록, 크기 제한, 코드 및 이름 규칙은 [전체 픽스처 설명](docs/FIXTURES.md)을 참고하세요.

## 시나리오

내장 시나리오는 `default`, `empty`, `error`, `slow`, `server-error`입니다. 각각 일반 픽스처 처리, 빈 결과, 오류 결과, 지연, 프로토콜 내부 오류를 재현합니다. 픽스처에 별도 이름을 선언하면 일부 도구의 응답을 바꿀 수 있습니다. 반복 가능한 `--fail-tool NAME`은 정확히 일치하는 도구를 실패시킵니다. 알 수 없는 도구와 동시성, 인자 검사가 먼저 실행되고 내장 오류 및 빈 시나리오는 실패 도구 설정보다 우선합니다. 자세한 순서는 [시나리오 설명](docs/SCENARIOS.md)과 [구조 설명](ARCHITECTURE.md)에 있습니다.

## 인자 검증

지원 키워드는 `type`, `enum`, `const`, `required`, `properties`, `additionalProperties`의 false 또는 스키마, 단일 스키마인 `items`, `minItems`, `maxItems`, `minLength`, `maxLength`, `minimum`, `maximum`, 숫자형 `exclusiveMinimum`, `exclusiveMaximum`입니다. 문자열 길이는 유니코드 코드 포인트로 계산하고 동등성은 깊게 비교합니다. 인자가 없으면 빈 객체로 취급합니다.

다른 모든 키워드는 검증하지 않고 무시합니다. 예를 들어 `pattern`, `format`, `$ref`, `oneOf`, `anyOf`, `allOf`, `not`, `if`, `patternProperties`는 적용되지 않습니다. 따라서 전체 JSON Schema 검증기로 사용해서는 안 됩니다. `--no-validate-arguments`로 이 검증을 끌 수 있습니다.

## 보고서와 마스킹

호출 기록은 메모리에 보관하며 `--report FILE`을 지정한 경우에만 종료 시 원자적으로 파일에 씁니다. 보고서에는 호출 합계, 결과별 수, 도구별 요약, 마지막 호출, 처음 1,000개의 호출 및 제외된 호출 수가 들어갑니다. 기본 마스킹은 모든 깊이에서 키 이름을 대소문자 구분 없이 검사합니다. 대상은 password, passwd, secret, token, apikey, api_key, api-key, authorization, auth, credential, cookie, session, privatekey, private_key입니다.

`--mask-key NAME`을 반복해 정확한 키를 추가하거나 `--no-record-arguments`로 인자 기록을 완전히 생략할 수 있습니다. 기록 문자열은 1,000자에서 잘리고 깊이 16을 넘는 내용은 잘림 표시로 대체됩니다. 모든 비밀을 자동으로 알아낼 수는 없으므로 보고서를 공유하기 전에 직접 확인하세요.

## 명령어 참고

```text
joons-mcp-mock-server start --snapshot FILE [--fixtures FILE] [--scenario NAME] [--fail-tool NAME]... [--slow-delay-ms N] [--call-timeout-ms N] [--max-concurrency N] [--no-validate-arguments] [--mark-descriptions] [--report FILE] [--mask-key NAME]... [--no-record-arguments] [--quiet]
joons-mcp-mock-server validate --snapshot FILE [--format terminal|json]
joons-mcp-mock-server validate-fixtures --fixtures FILE [--snapshot FILE] [--format terminal|json]
joons-mcp-mock-server --help | --version
```

`--mark-descriptions`는 설명 앞에 `[MOCK]`를 붙이고 `--quiet`는 시작 배너를 숨깁니다. 느린 시나리오 지연 기본값은 2,000밀리초이며 범위는 0부터 30,000입니다. 호출 제한 시간 기본값은 30,000밀리초이고 범위는 1부터 60,000입니다. 동시 호출 기본값은 8이며 1부터 64까지 설정합니다. 시작 명령의 표준 출력은 MCP 프로토콜 전용이며 상태는 표준 오류에 표시합니다. 검증 JSON에는 형식, 스키마 버전, 성공 여부, 오류와 경고가 들어갑니다. 옵션은 등호 또는 공백으로 값을 받을 수 있고 단일 값 옵션을 중복하면 사용 오류입니다.

## 종료 코드

| 코드 | 의미 |
|---|---|
| 0 | 정상 종료 또는 유효한 입력, 경고 포함 |
| 2 | 입력이나 설정이 유효하지 않음 |
| 3 | 명령 사용 오류 |
| 4 | 보고서 쓰기 실패 |

## 제한

스냅샷은 최대 64 MiB, 픽스처는 16 MiB이며 도구는 최대 10,000개입니다. JSON 깊이는 64, 노드는 2,000,000개까지입니다. 스냅샷 문자열과 키는 UTF-16 코드 단위 100,000개, 픽스처는 1,000,000개까지입니다. 인자는 1 MiB, 직렬화된 응답은 4 MiB까지이며 응답 블록은 100개까지입니다. 도구별 일치 항목은 100개, 픽스처 시나리오는 100개까지이고 인자 검증 오류는 최대 10개입니다. 세부 제약은 픽스처 설명을 참고하세요.

## 0.1.0에 없는 기능

Streamable HTTP, 리소스, 프롬프트, 페이지 나누기는 지원하지 않습니다. 표준 입출력으로 도구만 제공합니다.

## 상태와 라이선스

0.1.0은 미리보기이며 npm에 게시되지 않았습니다. [Apache-2.0 라이선스](LICENSE)를 따릅니다. [보안 안내](SECURITY.md)와 [기여 방법](CONTRIBUTING.md)도 참고하세요.
