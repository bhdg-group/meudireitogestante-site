// ============================================
// GOOGLE APPS SCRIPT — Meu Direito Gestante
// v2.0 — Com segurança e validações
// ============================================
//
// INSTRUÇÕES:
// 1. Acesse https://script.google.com
// 2. Clique em "Novo Projeto"
// 3. Apague o conteúdo e cole este código inteiro
// 4. Salve (Ctrl+S)
// 5. Clique em "Implantar" → "Nova implantação"
// 6. Tipo: "App da Web"
// 7. Executar como: "Eu" (sua conta)
// 8. Quem tem acesso: "Qualquer pessoa"
// 9. Clique em "Implantar"
// 10. Copie a URL gerada e cole no quiz.html
//

// ===== CONFIGURAÇÕES =====
var CONFIG = {
  // Token secreto — o quiz.html precisa enviar este mesmo token
  TOKEN_SECRETO: 'mdg-2026-xK9mP4wL7nR2',

  // Domínios permitidos (deixe vazio para aceitar qualquer um durante testes)
  DOMINIOS_PERMITIDOS: ['meudireitogestante.com.br', 'localhost'],

  // Tamanho máximo por arquivo em bytes (5 MB)
  MAX_ARQUIVO_BYTES: 5 * 1024 * 1024,

  // ID da pasta "Leads Auxílio Maternidade" no Drive
  // Para encontrar: abra a pasta no Drive, copie o ID da URL
  // Ex: https://drive.google.com/drive/folders/ESTE_ID_AQUI
  PASTA_LEADS_ID: ''
};

function doPost(e) {
  try {
    // Aceita JSON direto ou via campo 'payload' de form
    var raw = e.postData.contents;
    var payload;
    try {
      payload = JSON.parse(raw);
    } catch(parseErr) {
      // Form POST: dados vêm como payload=...
      var params = e.parameter || {};
      if (params.payload) {
        payload = JSON.parse(decodeURIComponent(params.payload));
      } else {
        payload = JSON.parse(raw);
      }
    }

    // ===== VALIDAÇÃO 1: Token secreto =====
    if (payload.token !== CONFIG.TOKEN_SECRETO) {
      return resposta('erro', 'Acesso negado');
    }

    // ===== VALIDAÇÃO 2: Campos obrigatórios =====
    if (!payload.nome || payload.nome.trim().length < 3) {
      return resposta('erro', 'Nome inválido');
    }
    if (!payload.cpf || payload.cpf.replace(/\D/g, '').length < 11) {
      return resposta('erro', 'CPF inválido');
    }
    if (!payload.tel || payload.tel.replace(/\D/g, '').length < 10) {
      return resposta('erro', 'Telefone inválido');
    }

    // ===== VALIDAÇÃO 3: Tamanho dos arquivos =====
    if (payload.documento) {
      var docSize = Utilities.base64Decode(payload.documento).length;
      if (docSize > CONFIG.MAX_ARQUIVO_BYTES) {
        return resposta('erro', 'Documento excede 5 MB');
      }
    }
    if (payload.comprovante) {
      var compSize = Utilities.base64Decode(payload.comprovante).length;
      if (compSize > CONFIG.MAX_ARQUIVO_BYTES) {
        return resposta('erro', 'Comprovante excede 5 MB');
      }
    }

    // ===== SANITIZAR DADOS =====
    var nome = sanitizar(payload.nome).toUpperCase().trim();
    var cpf = payload.cpf.replace(/\D/g, '');
    var cpfFormatado = cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    var dataNasc = sanitizar(payload.dataNasc || '');
    var tel = sanitizar(payload.tel || '');
    var estado = sanitizar(payload.estado || '');
    var situacao = sanitizar(payload.situacao || '');
    var carteira = sanitizar(payload.carteira || '');
    var filhos = sanitizar(payload.filhos || '');
    var bolsa = sanitizar(payload.bolsa || '');
    var entrada = sanitizar(payload.entrada || '');
    var canal = sanitizar(payload.canal || 'organico');

    // ===== NOME DA PASTA: NOME - CPF (últimos 4 dígitos) =====
    var cpfSufixo = cpf.slice(-4);
    var nomePasta = nome + ' - ' + cpfSufixo;

    // ===== ABRIR OU CRIAR PASTA DE LEADS =====
    var pastaLeads;
    if (CONFIG.PASTA_LEADS_ID && CONFIG.PASTA_LEADS_ID.length > 5) {
      pastaLeads = DriveApp.getFolderById(CONFIG.PASTA_LEADS_ID);
    } else {
      var busca = DriveApp.getFoldersByName('Leads Auxílio Maternidade');
      pastaLeads = busca.hasNext() ? busca.next() : DriveApp.createFolder('Leads Auxílio Maternidade');
    }

    // ===== CRIAR OU REUSAR PASTA DO LEAD =====
    var pastasExistentes = pastaLeads.getFoldersByName(nomePasta);
    var pastaLead = pastasExistentes.hasNext() ? pastasExistentes.next() : pastaLeads.createFolder(nomePasta);

    // ===== CRIAR info.txt =====
    var agora = new Date();
    var dataFormatada = Utilities.formatDate(agora, 'America/Recife', 'yyyy-MM-dd HH:mm');

    var info = [
      'Nome: ' + nome,
      'CPF: ' + cpfFormatado,
      'Data de Nascimento: ' + dataNasc,
      'Telefone: ' + tel,
      'Estado: ' + estado,
      'Situação: ' + situacao,
      'Carteira: ' + carteira,
      'Filhos: ' + filhos,
      'Bolsa Família: ' + bolsa,
      'Canal de aquisição: ' + canal,
      'Data de entrada: ' + dataFormatada,
      'Status: AGUARDANDO_ANALISE'
    ].join('\n');

    // Salvar ou atualizar info.txt
    var infos = pastaLead.getFilesByName('info.txt');
    if (infos.hasNext()) {
      infos.next().setContent(info);
    } else {
      pastaLead.createFile('info.txt', info, MimeType.PLAIN_TEXT);
    }

    // ===== SALVAR DOCUMENTO (RG/CNH) =====
    var temDoc = false;
    if (payload.documento && payload.documento.length > 100) {
      var extDoc = getExtensao(payload.documentoNome || 'documento.jpg');
      var nomeDoc = 'Identidade - ' + nome + '.' + extDoc;

      // Remover versão anterior
      limparArquivo(pastaLead, nomeDoc);

      var blobDoc = Utilities.newBlob(
        Utilities.base64Decode(payload.documento),
        getMimeType(extDoc),
        nomeDoc
      );
      pastaLead.createFile(blobDoc);
      temDoc = true;
    }

    // ===== SALVAR COMPROVANTE =====
    var temComp = false;
    if (payload.comprovante && payload.comprovante.length > 100) {
      var extComp = getExtensao(payload.comprovanteNome || 'comprovante.jpg');
      var nomeComp = 'Comprovante Residencia - ' + nome + '.' + extComp;

      limparArquivo(pastaLead, nomeComp);

      var blobComp = Utilities.newBlob(
        Utilities.base64Decode(payload.comprovante),
        getMimeType(extComp),
        nomeComp
      );
      pastaLead.createFile(blobComp);
      temComp = true;
    }

    // ===== ATUALIZAR STATUS =====
    var status = 'AGUARDANDO_DOCUMENTOS';
    if (temDoc && temComp) status = 'DOCUMENTACAO_COMPLETA';
    else if (temDoc) status = 'FALTA_COMPROVANTE';
    else if (temComp) status = 'FALTA_IDENTIDADE';

    info = info.replace('AGUARDANDO_ANALISE', status);
    var infoFile = pastaLead.getFilesByName('info.txt');
    if (infoFile.hasNext()) infoFile.next().setContent(info);

    // ===== LOG NO CONSOLE =====
    Logger.log('Lead salvo: ' + nomePasta + ' | Status: ' + status + ' | Canal: ' + canal);

    return resposta('ok', null, {
      pasta: nomePasta,
      documentacao: status,
      canal: canal
    });

  } catch (err) {
    Logger.log('ERRO: ' + err.toString());
    return resposta('erro', err.toString());
  }
}

// ===== FUNÇÕES AUXILIARES =====

function resposta(status, mensagem, dados) {
  var obj = { status: status };
  if (mensagem) obj.mensagem = mensagem;
  if (dados) {
    for (var k in dados) obj[k] = dados[k];
  }
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sanitizar(str) {
  if (!str) return '';
  // Remove tags HTML e caracteres perigosos
  return String(str)
    .replace(/<[^>]*>/g, '')
    .replace(/[<>"'`\\]/g, '')
    .trim()
    .substring(0, 500);
}

function getExtensao(nomeArquivo) {
  var partes = String(nomeArquivo).split('.');
  var ext = partes.length > 1 ? partes.pop().toLowerCase() : 'jpg';
  var permitidas = ['jpg', 'jpeg', 'png', 'pdf'];
  return permitidas.indexOf(ext) >= 0 ? ext : 'jpg';
}

function getMimeType(ext) {
  var tipos = {
    'jpg': MimeType.JPEG,
    'jpeg': MimeType.JPEG,
    'png': MimeType.PNG,
    'pdf': MimeType.PDF
  };
  return tipos[ext] || MimeType.JPEG;
}

function limparArquivo(pasta, nome) {
  var existentes = pasta.getFilesByName(nome);
  while (existentes.hasNext()) {
    existentes.next().setTrashed(true);
  }
}

// ===== ENDPOINT GET (teste) =====
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'ok',
    mensagem: 'Webhook Meu Direito Gestante ativo',
    versao: '2.0'
  })).setMimeType(ContentService.MimeType.JSON);
}
