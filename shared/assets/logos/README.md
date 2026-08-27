# logos — 계열사 로고 규칙

## 폴더/파일 이름 규칙

```
logos/{계열사-slug}/{계열사-slug}-mark.svg            단색(검정 채우기, 배경 투명, 외곽선 없음) — CSS mask로 색을 바꿔 씀
logos/{계열사-slug}/{계열사-slug}-mark-gradient.svg   그라데이션 등 원색 그대로 써야 하는 버전 (있는 계열사만)
```

- `{계열사-slug}` 폴더명은 `shared/scripts/company-info.js`의 `DISE.companies` key와 반드시 동일해야 합니다.
- 파일명은 영문 소문자 + 하이픈만 사용합니다.
- `-mark.svg`는 항상 있어야 하는 필수 파일입니다. `-mark-gradient.svg`는 브랜드 컬러가 그라데이션인 계열사에만 추가합니다(현재는 R2V만 해당).
- SVG 준비 방법(일러스트레이터 내보내기 설정 포함)은 이 대화에서 안내드린 내용을 따르면 됩니다: 채우기 검정 단색 · 배경 투명 · 외곽선 없음 · 텍스트는 윤곽선으로 변환.

## 현재 상태

| 계열사 | mark.svg | mark-gradient.svg | 문서 템플릿에 연결됨 |
|---|---|---|---|
| disehimedia | ✅ | — | ✅ (공문) |
| r2v | ✅ | ✅ | ⬜ |
| bic | ✅ | — | ⬜ |
| axis-one | ✅ | — | ⬜ |

"문서 템플릿에 연결됨"이 ⬜인 계열사는 로고는 준비됐지만 아직 `company-info.js`에 주소·연락처 정보가 없어서 문서 푸터를 완성할 수 없는 상태입니다 — 정보가 확정되면 `company-info.js`의 해당 계열사 항목에 채워 넣고 새 템플릿(또는 기존 템플릿의 `company` 옵션)에 연결하면 됩니다.

## 새 계열사가 추가되면

1. 이 규칙대로 `logos/{새-slug}/{새-slug}-mark.svg`를 추가합니다(폴더가 비어 있으면 이 규칙에 맞는 파일이 아직 없다는 뜻입니다).
2. `shared/scripts/company-info.js`의 `DISE.companies`에 항목을 추가합니다(로고 경로, `logoRatio`, 주소·연락처).
3. 위 표에 행을 추가합니다.
