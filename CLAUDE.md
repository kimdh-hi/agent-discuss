# Project Rules

## 데이터 접근 패턴

- `EntityManager`를 서비스/가드에 직접 주입하지 않는다.
- `MikroOrmModule.forFeature([Entity])` 로 모듈에 엔티티를 등록하고,
  `@InjectRepository(Entity)` 로 `EntityRepository<T>` 를 주입받아 사용한다.
- RAG 커넥션(contextName `'rag'`) 엔티티는 `@InjectRepository(Entity, 'rag')` 로 주입한다.
- `EntityRepository`에 직접 `flush()` 메서드는 없으므로 `repo.getEntityManager().flush()` 를 사용한다.

## 코드 스타일

- 코드에 주석을 작성하지 않는다.
