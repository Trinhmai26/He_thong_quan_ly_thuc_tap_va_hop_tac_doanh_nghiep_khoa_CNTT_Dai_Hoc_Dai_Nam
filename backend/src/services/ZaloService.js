const axios = require('axios');

const OA_BASE = 'https://openapi.zalo.me/v3.0/oa';

function getToken() {
  return process.env.ZALO_OA_ACCESS_TOKEN || '';
}

class ZaloService {
  /**
   * Gửi tin nhắn văn bản đến một follower (đã follow OA)
   * @param {string} zaloUserId - ID Zalo của người nhận (follower)
   * @param {string} text - Nội dung tin nhắn (tối đa 2000 ký tự)
   */
  static async sendTextMessage(zaloUserId, text) {
    const token = getToken();
    if (!token || token === 'your_zalo_oa_access_token_here') {
      console.warn('[ZaloService] ZALO_OA_ACCESS_TOKEN chưa được cấu hình.');
      return { success: false, error: 'Token chưa cấu hình' };
    }

    try {
      const res = await axios.post(
        `${OA_BASE}/message/cs`,
        {
          recipient: { user_id: zaloUserId },
          message: { text: text.substring(0, 2000) }
        },
        {
          headers: {
            access_token: token,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );
      // Zalo trả về error code 0 = thành công
      if (res.data?.error === 0) {
        return { success: true, data: res.data };
      }
      return { success: false, error: res.data?.message || 'Zalo API error', code: res.data?.error };
    } catch (err) {
      console.error('[ZaloService] sendTextMessage error:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Gửi tin nhắn đến nhiều người (tuần tự, tránh rate limit)
   * @param {Array<{zaloUserId: string, name: string}>} recipients
   * @param {string} text
   * @returns {{ sent: number, failed: number, errors: Array }}
   */
  static async sendBulk(recipients, text) {
    const results = { sent: 0, failed: 0, errors: [] };
    for (const r of recipients) {
      const res = await this.sendTextMessage(r.zaloUserId, text);
      if (res.success) {
        results.sent++;
      } else {
        results.failed++;
        results.errors.push({ name: r.name, error: res.error });
      }
      // Delay 300ms giữa mỗi request để tránh rate limit
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    return results;
  }

  /**
   * Lấy thông tin profile của follower (để xác nhận liên kết)
   * @param {string} zaloUserId
   */
  static async getFollowerProfile(zaloUserId) {
    const token = getToken();
    if (!token || token === 'your_zalo_oa_access_token_here') {
      return { success: false, error: 'Token chưa cấu hình' };
    }

    try {
      const res = await axios.get(`${OA_BASE}/getprofile`, {
        params: { user_id: zaloUserId },
        headers: { access_token: token },
        timeout: 8000
      });
      if (res.data?.error === 0) {
        return { success: true, data: res.data.data };
      }
      return { success: false, error: res.data?.message };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

module.exports = ZaloService;
