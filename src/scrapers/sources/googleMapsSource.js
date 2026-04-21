const puppeteer = require("puppeteer");
const { safePhone, isValidEmail } = require("./scraperSanitizers");

// Adicionando um regex básico para tentar achar e-mails no site, se existir
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

async function scrapeGoogleMaps(source, config, logger) {
  const leads = [];
  let browser;

  // Extrai a query (ex: "Clínica Odontológica em São Paulo") da base_url, ou do notes, ou do nome
  // Ex: base_url = "https://www.google.com/maps/search/clinica+odontologica+sao+paulo"
  const searchUrl = source.base_url;
  
  // O limite agora será definido pelo env ou usaremos 10000 (basicamente rasparemos tudo o que o Google deixar para essa query)
  const maxItems = Math.max(1, Number(config.maxItems || 10000));

  try {
    logger.info({ url: searchUrl }, "Iniciando Puppeteer para Google Maps");
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });

    const page = await browser.newPage();
    // Configura viewport e user-agent para evitar alguns bloqueios
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36");

    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 45000 });
    
    // Aguarda o container de resultados aparecer
    await page.waitForSelector('div[role="feed"]', { timeout: 15000 }).catch(() => null);

    let itemsExtraidos = 0;
    
    // Função para fazer scroll no painel lateral até o fim
    let attempts = 0;
    let previousHeight = 0;
    
    logger.info("Realizando scroll para carregar todos os resultados...");
    while (attempts < 15) { // Tenta algumas vezes antes de desistir se não mudar a altura
      const currentHeight = await page.evaluate(() => {
        const feed = document.querySelector('div[role="feed"]');
        if (feed) {
          feed.scrollBy(0, 5000);
          return feed.scrollHeight;
        }
        return 0;
      });
      
      await new Promise(r => setTimeout(r, 1500));
      
      const isEnd = await page.evaluate(() => {
         return document.body.innerText.includes("Você chegou ao final da lista") || 
                document.body.innerText.includes("You've reached the end of the list");
      });
      
      if (isEnd) {
         logger.info("Chegou ao final da lista do Google Maps.");
         break;
      }

      if (currentHeight === previousHeight && currentHeight > 0) {
        attempts++;
      } else {
        attempts = 0;
        previousHeight = currentHeight;
      }
    }

    // Extrair os links de cada local listado
    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('div[role="feed"] a'));
      return anchors
        .map(a => a.href)
        .filter(href => href.includes('/maps/place/'));
    });

    // Remove duplicatas
    const uniqueLinks = [...new Set(links)].slice(0, maxItems);
    logger.info({ count: uniqueLinks.length }, "Locais encontrados no Maps");

    for (const link of uniqueLinks) {
      let detailPage = null;
      let sitePage = null;
      try {
        detailPage = await browser.newPage();
        await detailPage.goto(link, { waitUntil: "domcontentloaded", timeout: 20000 });
        
        // Aguardar o título h1 carregar para garantir que a página abriu os detalhes
        await detailPage.waitForSelector('h1', { timeout: 10000 }).catch(() => null);

        // Extrai dados da página do detalhe do local
        const data = await detailPage.evaluate(() => {
          const nameEl = document.querySelector('h1');
          const name = nameEl ? nameEl.innerText : "Nome Não Encontrado";
          
          // O Google Maps frequentemente usa botões com data-item-id ou ícones específicos para contatos
          const buttons = Array.from(document.querySelectorAll('button'));
          let phone = null;
          let website = null;
          
          for (const btn of buttons) {
            const text = btn.innerText || "";
            // Telefone costuma ter números e formatação (ex: (11) 99999-9999)
            if (text.match(/[\d\s\(\)\-]{8,}/) && !phone) {
              // Verifica se não é um CEP ou algo assim
              if (!text.includes("CEP") && !text.includes(",")) {
                 phone = text.replace(/[^\d\(\)\-\+ ]/g, "").trim();
              }
            }
          }
          
          const links = Array.from(document.querySelectorAll('a'));
          for (const a of links) {
             const href = a.href || "";
             if (href.startsWith("http") && !href.includes("google.com") && !website) {
                website = href;
             }
          }

          return { name, phone, website };
        });

        await detailPage.close();
        detailPage = null;

        // Se encontrou site, podemos tentar abrir para pegar um email
        let email = null;
        if (data.website) {
          try {
             sitePage = await browser.newPage();
             // Timeout curto para não travar muito tempo em sites lentos
             await sitePage.goto(data.website, { waitUntil: "domcontentloaded", timeout: 10000 });
             const bodyHTML = await sitePage.evaluate(() => document.body.innerText);
             const emailsEncontrados = bodyHTML.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
             if (emailsEncontrados && emailsEncontrados.length > 0) {
                // Pega o primeiro email válido (evitando .png, etc)
                email = emailsEncontrados.find(e => !e.endsWith(".png") && !e.endsWith(".jpg"));
             }
          } catch(e) {
             // Ignora erro ao acessar site do cliente
          } finally {
              if (sitePage) await sitePage.close().catch(() => {});
          }
        }

        if (email && !isValidEmail(email)) {
            email = null;
        }

        // Gera e-mail falso só pro sistema aceitar se não achou site (seu schema exige)
        if (!email) {
           const phoneStr = safePhone(data.phone) || "";
           const phoneKey = phoneStr.replace(/\D/g, "") || Math.floor(Math.random()*1000000).toString();
           email = `sem-email-${phoneKey}@mapscraper.local`;
        }

        const validPhone = safePhone(data.phone);
        
        // Só salva se tiver encontrado um nome real e um telefone válido!
        if (data.name && data.name !== "Nome Não Encontrado" && validPhone) {
          leads.push({
            name: data.name,
            email: email.toLowerCase(),
            phone: validPhone,
            raw_data: {
              source: "Google Maps",
              website: data.website,
              maps_url: link,
              scraped_phone: data.phone
            }
          });
        } else {
          logger.debug({ name: data.name, phone: validPhone }, "Lead descartado por falta de dados válidos");
        }
      } catch (errDetail) {
         logger.warn({ link, error: errDetail.message }, "Erro ao extrair detalhes de um local");
      } finally {
         if (detailPage) await detailPage.close().catch(() => {});
      }
    }
  } catch (error) {
    logger.error({ error: error.message }, "Erro fatal no scraper do Google Maps");
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return leads;
}

module.exports = {
  scrapeGoogleMaps
};
