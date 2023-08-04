
# Быстрая установка зависимостей (для сборки контейнеров) в моно репозитории, с выбором только используемых в данном контейнере


## Установка

```bash
npm i @lad-tech/nsc-fast-install -D

```

### Пример использования

```bash 
cd services/serviceFolder &&  npm run build
cd projectRoot
npx nsc-fast-install --entryPoint services/ExampleService/start.ts     
# OR 
npx nsc-fast-install--service services/ExampleService 
```
