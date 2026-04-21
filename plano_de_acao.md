# Plano de Ação: Coleta em Massa de Leads (Frios)

Este plano está dividido em 3 etapas progressivas. A ideia é esgotar uma fonte, popular o banco de dados e, em seguida, passar para a próxima técnica, aumentando a complexidade técnica e a qualidade dos leads conforme avançamos.

## Passo 1: Extração de Dados Públicos de CNPJ (Receita Federal)
**Objetivo:** Volume altíssimo de leads B2B (empresas) sem risco de bloqueio, utilizando dados abertos do governo.

*   **Estratégia:**
    *   Definir os CNAEs (códigos de atividade econômica) que fazem sentido para o seu negócio.
    *   Definir as regiões alvo (Estados ou Cidades).
*   **Ação:**
    *   Criaremos um script para consumir APIs gratuitas (ex: `Minha Receita`, `BrasilAPI` ou `CNPJ.ws`).
    *   *Alternativa de maior volume:* Baixar a base completa da Receita Federal (arquivos CSV pesados) e criar um script em Python para filtrar os CNAEs desejados e salvar no seu banco de dados (Nome da Empresa, E-mail, Telefone, Capital Social).
*   **Quando finalizar:** Teremos uma base inicial gigantesca e segmentada por nicho e região, pronta para as primeiras campanhas.

---

## Passo 2: Scraping de Negócios Locais (Google Maps)
**Objetivo:** Capturar leads de negócios físicos e locais que estão ativamente na internet, geralmente com contatos mais atualizados que a base da Receita.

*   **Estratégia:**
    *   Focar em nichos específicos (ex: "Clínicas odontológicas", "Escritórios de contabilidade", "Restaurantes").
    *   Definir as cidades para a busca.
*   **Ação:**
    *   Desenvolveremos um scraper utilizando Python (com Selenium/Playwright) ou Node.js (Puppeteer).
    *   O script fará buscas automatizadas no Google Maps e extrairá: Nome do Local, Telefone, Site, Endereço e Avaliações.
    *   *Bônus:* Criar uma etapa extra no script para visitar o "Site" extraído e procurar por e-mails (usando Regex).
*   **Quando finalizar:** O banco estará enriquecido com empresas ativas, com sites e telefones verificados recentemente pelas próprias empresas no Google.

---

## Passo 3: Scraping Direcionado (Conselhos Profissionais ou Plataformas)
**Objetivo:** Buscar profissionais específicos (B2B ou B2C de alto valor) que são mais difíceis de encontrar nas etapas anteriores.

*   **Estratégia:**
    *   Definir a profissão exata do seu cliente ideal (ex: Advogados, Engenheiros, Corretores, Desenvolvedores).
*   **Ação:**
    *   Se o alvo for tradicional (Advogados, Médicos): Faremos scraping nos sites de conselhos (OAB, CRM) utilizando técnicas para passar por páginas de busca e extrair a lista pública de inscritos.
    *   Se o alvo for corporativo/tech: Utilizaremos **Google Dorks** (ex: `site:br.linkedin.com/in "Diretor de RH"`) combinados com um scraper simples para extrair os nomes, cargos e empresas, ou rasparemos o GitHub via API para extrair e-mails de desenvolvedores.
*   **Quando finalizar:** Você terá leads altamente qualificados pelo cargo ou profissão, perfeitos para uma abordagem fria, porém muito personalizada.

---

### Próximos Passos Imediatos:
Para começarmos a executar o **Passo 1** agora, preciso que você defina:
1. Qual é o **nicho principal** de empresas que você quer atingir (ex: lojas de roupa, indústrias, tecnologia)?
2. Qual a **região** (Brasil todo ou um estado específico)?
3. Onde você quer que eu salve esses dados por enquanto (Arquivo CSV, Banco de Dados SQL/NoSQL)?
