-- RAG 전용 DB 초기화 (agent-discuss RAG 커넥션). 벡터 검색을 위해 pgvector 설치.
-- 컨테이너 기본 DB(agent_discuss_rag)에 적용된 뒤, 테스트 DB(agent_discuss_rag_test)도 함께 준비한다.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 테스트 전용 데이터베이스
CREATE DATABASE agent_discuss_rag_test;
\c agent_discuss_rag_test
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
