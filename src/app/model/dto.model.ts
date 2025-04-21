export interface UserDTO {
    id?: string;
    userName?: string;
    email?: string;
    phoneNumber?: string;
    address?: string;
    dateOfBirth?: string;
    avatar?: string;
    // Các thuộc tính khác
}

export interface ChatMessage {
    senderId: string;
    senderName: string;
    receiverId: string;
    content: string;
    createdDate?: Date;
    type: 'CHAT' | 'JOIN' | 'LEAVE' | 'GROUP_CHAT' | 'OFFER';
    fileUrl?: string; 
    contentType?: 'TEXT' | 'IMAGE' | 'FILE';
}

export interface ChatListItem {
    type: 'user' | 'group';
    id: string;
    name: string;
    email?: string;
    avatar?: string;
    memberCount?: number;
    lastMessage?: string;
    lastActive?: Date | string;
    unreadCount?: number;
    //thêm contentType vào đây để hiển thị icon cho tin nhắn cuối cùng
}